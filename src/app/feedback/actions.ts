"use server";
// "שינויים ושיפורים": any approved user writes; only admins mark handled / reply / delete.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession, type Session } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { audit } from "@/platform/server/audit";

const PATH = "/feedback";
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["idea", "bug", "complaint", "other"] as const;
const MAX_OPEN_PER_USER = 10;

function back(msg: { error?: string; ok?: string }, view?: string): never {
  const q = new URLSearchParams();
  if (view) q.set("view", view);
  if (msg.error) q.set("error", msg.error);
  if (msg.ok) q.set("ok", msg.ok);
  revalidatePath(PATH);
  redirect(`${PATH}?${q}`);
}
async function requireUser(): Promise<Session> {
  const s = await getSession();
  if (!s || s.profile.status !== "approved") redirect("/signin?next=/feedback");
  return s;
}
async function requireAdmin(): Promise<Session> {
  const s = await requireUser();
  if (s.profile.role !== "admin") redirect(PATH);
  return s;
}
const clean = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
function id(form: FormData, view?: string): string {
  const v = String(form.get("id") ?? "");
  if (!uuidRe.test(v)) back({ error: "מזהה לא תקין" }, view);
  return v;
}

export async function sendFeedback(form: FormData) {
  const s = await requireUser();
  const kindRaw = String(form.get("kind") ?? "idea");
  const kind = (KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "other";
  const body = clean(form.get("body"), 1500);
  if (body.length < 3) back({ error: "כתבו לפחות כמה מילים" });
  const db = await getDb();
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.feedback where author_id = $1 and status = 'open'", [s.profile.id]);
  if ((rows[0]?.n ?? 0) >= MAX_OPEN_PER_USER) back({ error: `יש לך כבר ${MAX_OPEN_PER_USER} פניות פתוחות — חכו שיטופלו` });
  await db.query("insert into public.feedback (kind, body, author_id) values ($1, $2, $3)", [kind, body, s.profile.id]);
  revalidatePath("/", "layout");
  back({ ok: "נשלח למנהל האתר — תודה! התשובה תופיע כאן." });
}

export async function withdrawFeedback(form: FormData) {
  const s = await requireUser();
  const fid = id(form);
  await (await getDb()).query("delete from public.feedback where id = $1 and author_id = $2 and status = 'open' and reply is null", [fid, s.profile.id]);
  revalidatePath("/", "layout");
  back({ ok: "הפנייה בוטלה" });
}

export async function handleFeedback(form: FormData) {
  const s = await requireAdmin();
  const view = form.get("view") === "done" ? "done" : undefined;
  const fid = id(form, view);
  const reply = clean(form.get("reply"), 500) || null;
  const decision = String(form.get("decision") ?? "done");
  const db = await getDb();
  if (decision === "reopen") {
    await db.query("update public.feedback set status = 'open', handled_by = null, handled_at = null where id = $1", [fid]);
  } else if (decision === "reply") {
    await db.query("update public.feedback set reply = $2 where id = $1", [fid, reply]);
  } else {
    await db.query("update public.feedback set status = 'done', reply = coalesce($2, reply), handled_by = $3, handled_at = now() where id = $1", [fid, reply, s.profile.id]);
  }
  await audit(db, s.profile.id, `feedback.${decision}`, fid, {});
  revalidatePath("/", "layout");
  back({ ok: decision === "reopen" ? "הפנייה נפתחה מחדש" : decision === "reply" ? "התשובה נשמרה" : "סומן כטופל ✓" }, view);
}

export async function deleteFeedback(form: FormData) {
  const s = await requireAdmin();
  const view = form.get("view") === "done" ? "done" : undefined;
  const fid = id(form, view);
  const db = await getDb();
  await db.query("delete from public.feedback where id = $1", [fid]);
  await audit(db, s.profile.id, "feedback.delete", fid, {});
  revalidatePath("/", "layout");
  back({ ok: "נמחק" }, view);
}
