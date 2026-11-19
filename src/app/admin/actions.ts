"use server";
// Admin server actions (plan 03 + 07). Every action re-checks the caller's role,
// validates input, and writes to audit_log.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession, type Session } from "@/platform/auth/session";
import { setProviderBan } from "@/platform/auth";
import { getDb } from "@/platform/server/db";
import { audit } from "@/platform/server/audit";
import { commandersCanApprove } from "@/platform/server/config";
import { getApp } from "@/platform/server/registry";
import { validHebrewName } from "@/lib/validate";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdminAction(): Promise<Session> {
  const s = await getSession();
  if (!s || s.profile.status !== "approved" || s.profile.role !== "admin") redirect("/");
  return s;
}

function back(tab: string, msg?: { error?: string; ok?: string }): never {
  const q = new URLSearchParams({ tab });
  if (msg?.error) q.set("error", msg.error);
  if (msg?.ok) q.set("ok", msg.ok);
  revalidatePath("/admin");
  redirect(`/admin?${q}`);
}

function id(v: FormDataEntryValue | null): string {
  const s = String(v ?? "");
  if (!uuidRe.test(s)) back("users", { error: "מזהה לא תקין" });
  return s;
}

// ── approvals (admins; commanders for their own company when BAHAD_COMMANDERS_CAN_APPROVE=1) ──

async function requireApprover(targetId: string): Promise<Session> {
  const s = await getSession();
  if (!s || s.profile.status !== "approved") redirect("/");
  if (s.profile.role === "admin") return s;
  if (s.profile.role === "commander" && commandersCanApprove() && s.profile.company_id) {
    const { rows } = await (await getDb()).query<{ company_id: string | null }>("select company_id from public.profiles where id = $1", [targetId]);
    if (rows[0]?.company_id === s.profile.company_id) return s;
  }
  redirect("/");
}

export async function approveUser(form: FormData) {
  const target = id(form.get("id"));
  const s = await requireApprover(target);
  const db = await getDb();
  const { rows } = await db.query(
    "update public.profiles set status = 'approved', approved_at = now(), approved_by = $2 where id = $1 and status = 'pending' returning id",
    [target, s.profile.id],
  );
  if (rows.length) await audit(db, s.profile.id, "user.approve", target);
  back("users", { ok: "המשתמש אושר" });
}

export async function rejectUser(form: FormData) {
  const target = id(form.get("id"));
  const s = await requireApprover(target);
  const db = await getDb();
  const { rows } = await db.query("update public.profiles set status = 'blocked' where id = $1 and status = 'pending' returning id", [target]);
  if (rows.length) {
    await audit(db, s.profile.id, "user.reject", target);
    await setProviderBan(target, true);
  }
  back("users", { ok: "הבקשה נדחתה" });
}

// ── admin-only user management ──

export async function setBlocked(form: FormData) {
  const s = await requireAdminAction();
  const target = id(form.get("id"));
  const block = form.get("block") === "1";
  if (target === s.profile.id) back("users", { error: "אי אפשר לחסום את עצמך" });
  const db = await getDb();
  if (block) {
    const { rows } = await db.query<{ role: string }>("select role from public.profiles where id = $1", [target]);
    if (rows[0]?.role === "admin" && (await adminCount(db)) <= 1) back("users", { error: "חייב להישאר לפחות מנהל אחד" });
  }
  const { rows } = await db.query(
    `update public.profiles set status = $2::public.user_status,
            approved_at = case when $3::boolean then coalesce(approved_at, now()) else approved_at end
      where id = $1 and status <> $2::public.user_status returning id`,
    [target, block ? "blocked" : "approved", !block],
  );
  if (rows.length) {
    await audit(db, s.profile.id, block ? "user.block" : "user.unblock", target);
    await setProviderBan(target, block);
  }
  back("users", { ok: block ? "המשתמש נחסם" : "החסימה הוסרה" });
}

async function adminCount(db: Awaited<ReturnType<typeof getDb>>) {
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.profiles where role = 'admin' and status = 'approved'");
  return rows[0]?.n ?? 0;
}

export async function updateUser(form: FormData) {
  const s = await requireAdminAction();
  const target = id(form.get("id"));
  const role = String(form.get("role") ?? "");
  if (!["cadet", "commander", "admin"].includes(role)) back("users", { error: "תפקיד לא תקין" });
  const name = validHebrewName(String(form.get("name") ?? ""));
  if (!name) back("users", { error: "שם לא תקין (עברית, 2–40 תווים)" });
  const companyRaw = String(form.get("company") ?? "");
  const platoonRaw = String(form.get("platoon") ?? "");
  const companyId = companyRaw ? id(companyRaw) : null;
  const platoonId = platoonRaw ? id(platoonRaw) : null;
  const db = await getDb();
  const { rows: cur } = await db.query<{ role: string; company_id: string | null; platoon_id: string | null; full_name: string | null; status: string }>(
    "select role, company_id, platoon_id, full_name, status from public.profiles where id = $1",
    [target],
  );
  const before = cur[0];
  if (!before) back("users", { error: "המשתמש לא נמצא" });
  if (target === s.profile.id && role !== "admin") back("users", { error: "אי אפשר להוריד לעצמך הרשאת מנהל" });
  if (before.role === "admin" && role !== "admin" && before.status === "approved" && (await adminCount(db)) <= 1) {
    back("users", { error: "חייב להישאר לפחות מנהל אחד" });
  }
  if (platoonId) {
    const { rows } = await db.query("select 1 from public.platoons where id = $1 and company_id = $2", [platoonId, companyId]);
    if (!rows.length) back("users", { error: "המחלקה לא שייכת לפלוגה" });
  }
  await db.query("update public.profiles set role = $2::public.user_role, company_id = $3, platoon_id = $4, full_name = $5 where id = $1", [
    target,
    role,
    companyId,
    platoonId,
    name,
  ]);
  if (before.role !== role) await audit(db, s.profile.id, "user.role", target, { from: before.role, to: role });
  if (before.company_id !== companyId || before.platoon_id !== platoonId) {
    await audit(db, s.profile.id, "user.unit", target, { from: [before.company_id, before.platoon_id], to: [companyId, platoonId] });
  }
  if (before.full_name !== name) await audit(db, s.profile.id, "user.name", target, { from: before.full_name, to: name });
  back("users", { ok: "נשמר" });
}

// ── units ──

function unitName(v: FormDataEntryValue | null): string {
  const n = String(v ?? "").replace(/\s+/g, " ").trim();
  if (n.length < 1 || n.length > 40) back("units", { error: "שם יחידה: 1–40 תווים" });
  return n;
}

export async function addCompany(form: FormData) {
  const s = await requireAdminAction();
  const name = unitName(form.get("name"));
  const db = await getDb();
  try {
    const { rows } = await db.query<{ id: string }>(
      "insert into public.companies (name, sort) values ($1, (select coalesce(max(sort), -1) + 1 from public.companies)) returning id",
      [name],
    );
    await audit(db, s.profile.id, "unit.company.add", rows[0].id, { name });
  } catch {
    back("units", { error: "כבר קיימת פלוגה בשם הזה" });
  }
  back("units", { ok: "הפלוגה נוספה" });
}

export async function renameCompany(form: FormData) {
  const s = await requireAdminAction();
  const cid = id(form.get("id"));
  const name = unitName(form.get("name"));
  const db = await getDb();
  try {
    await db.query("update public.companies set name = $2 where id = $1", [cid, name]);
  } catch {
    back("units", { error: "כבר קיימת פלוגה בשם הזה" });
  }
  await audit(db, s.profile.id, "unit.company.rename", cid, { name });
  back("units", { ok: "נשמר" });
}

export async function deleteCompany(form: FormData) {
  const s = await requireAdminAction();
  const cid = id(form.get("id"));
  const db = await getDb();
  const { rows } = await db.query<{ n: number }>(
    "select (select count(*) from public.platoons where company_id = $1) + (select count(*) from public.profiles where company_id = $1) as n",
    [cid],
  );
  if (Number(rows[0]?.n) > 0) back("units", { error: "אפשר למחוק רק פלוגה בלי מחלקות ובלי משתמשים" });
  await db.query("delete from public.companies where id = $1", [cid]);
  await audit(db, s.profile.id, "unit.company.delete", cid);
  back("units", { ok: "נמחק" });
}

export async function addPlatoon(form: FormData) {
  const s = await requireAdminAction();
  const cid = id(form.get("company"));
  const name = unitName(form.get("name"));
  const db = await getDb();
  try {
    const { rows } = await db.query<{ id: string }>("insert into public.platoons (company_id, name) values ($1, $2) returning id", [cid, name]);
    await audit(db, s.profile.id, "unit.platoon.add", rows[0].id, { company: cid, name });
  } catch {
    back("units", { error: "כבר קיימת מחלקה בשם הזה בפלוגה" });
  }
  back("units", { ok: "המחלקה נוספה" });
}

export async function renamePlatoon(form: FormData) {
  const s = await requireAdminAction();
  const pid = id(form.get("id"));
  const name = unitName(form.get("name"));
  const db = await getDb();
  try {
    await db.query("update public.platoons set name = $2 where id = $1", [pid, name]);
  } catch {
    back("units", { error: "כבר קיימת מחלקה בשם הזה בפלוגה" });
  }
  await audit(db, s.profile.id, "unit.platoon.rename", pid, { name });
  back("units", { ok: "נשמר" });
}

export async function deletePlatoon(form: FormData) {
  const s = await requireAdminAction();
  const pid = id(form.get("id"));
  const db = await getDb();
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.profiles where platoon_id = $1", [pid]);
  if ((rows[0]?.n ?? 0) > 0) back("units", { error: "אפשר למחוק רק מחלקה בלי משתמשים" });
  await db.query("delete from public.platoons where id = $1", [pid]);
  await audit(db, s.profile.id, "unit.platoon.delete", pid);
  back("units", { ok: "נמחק" });
}

// ── apps: kill switch ──

export async function setAppOverride(form: FormData) {
  const s = await requireAdminAction();
  const slug = String(form.get("slug") ?? "");
  if (!getApp(slug)) back("apps", { error: "אפליקציה לא קיימת" });
  const status = String(form.get("status") ?? "");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 200) || null;
  const db = await getDb();
  if (status === "none") {
    await db.query("delete from public.app_overrides where app_slug = $1", [slug]);
    await audit(db, s.profile.id, "app.restore", slug);
  } else if (status === "hidden" || status === "disabled") {
    await db.query(
      `insert into public.app_overrides (app_slug, status, reason, updated_by, updated_at) values ($1, $2, $3, $4, now())
       on conflict (app_slug) do update set status = excluded.status, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = now()`,
      [slug, status, reason, s.profile.id],
    );
    await audit(db, s.profile.id, status === "hidden" ? "app.hide" : "app.disable", slug, { reason });
  } else back("apps", { error: "מצב לא תקין" });
  back("apps", { ok: "עודכן" });
}

// ── app managers (admins only): moderate ONE app's collections battalion-wide ──

export async function addAppManager(form: FormData) {
  const s = await requireAdminAction();
  const slug = String(form.get("slug") ?? "");
  if (!getApp(slug)) back("apps", { error: "אפליקציה לא קיימת" });
  const user = String(form.get("user") ?? "");
  if (!uuidRe.test(user)) back("apps", { error: "יש לבחור משתמש" });
  const db = await getDb();
  const { rows } = await db.query<{ full_name: string | null }>("select full_name from public.profiles where id = $1 and status = 'approved'", [user]);
  if (!rows[0]) back("apps", { error: "המשתמש לא נמצא או לא מאושר" });
  await db.query(
    "insert into public.app_managers (app_slug, profile_id, granted_by) values ($1, $2, $3) on conflict do nothing",
    [slug, user, s.profile.id],
  );
  await audit(db, s.profile.id, "app.manager.add", user, { app: slug });
  back("apps", { ok: `${rows[0].full_name ?? "המשתמש"} מנהל/ת עכשיו את האפליקציה` });
}

export async function removeAppManager(form: FormData) {
  const s = await requireAdminAction();
  const slug = String(form.get("slug") ?? "");
  const user = String(form.get("user") ?? "");
  if (!uuidRe.test(user)) back("apps", { error: "מזהה לא תקין" });
  const db = await getDb();
  await db.query("delete from public.app_managers where app_slug = $1 and profile_id = $2", [slug, user]);
  await audit(db, s.profile.id, "app.manager.remove", user, { app: slug });
  back("apps", { ok: "ההרשאה הוסרה" });
}
