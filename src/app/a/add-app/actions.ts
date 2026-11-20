"use server";
// "הוספת אפליקציה": anyone approved suggests; only admins approve / reject / remove. Every action
// re-checks the session and writes the admin's decisions to audit_log.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession, type Session } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { audit } from "@/platform/server/audit";
import { effectiveStatus, getApp, loadOverride } from "@/platform/server/registry";
import { MAX_PENDING_PER_USER, SUBMISSION_EMOJIS, cleanText, normalizeGithubRepo, normalizeSiteUrl, validIconDataUrl } from "@/lib/submissions";

const PATH = "/a/add-app";
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function back(msg: { error?: string; ok?: string }, kind?: string): never {
  const q = new URLSearchParams();
  if (kind === "github") q.set("kind", "github");
  if (msg.error) q.set("error", msg.error);
  if (msg.ok) q.set("ok", msg.ok);
  revalidatePath(PATH);
  revalidatePath("/");
  redirect(`${PATH}?${q}`);
}

async function requireUser(): Promise<Session> {
  const s = await getSession();
  if (!s || s.profile.status !== "approved") redirect("/");
  const app = getApp("add-app");
  if (!app || effectiveStatus(app, await loadOverride(await getDb(), app.slug)) === "disabled") redirect("/");
  return s;
}
async function requireAdmin(): Promise<Session> {
  const s = await requireUser();
  if (s.profile.role !== "admin") redirect(PATH);
  return s;
}
function id(form: FormData): string {
  const v = String(form.get("id") ?? "");
  if (!uuidRe.test(v)) back({ error: "מזהה לא תקין" });
  return v;
}

export async function submitApp(form: FormData) {
  const s = await requireUser();
  const kind = form.get("kind") === "github" ? "github" : "url";
  const db = await getDb();
  let url: string;
  let name = cleanText(form.get("name"), 30);
  const description = cleanText(form.get("description"), 120);
  if (kind === "url") {
    const u = normalizeSiteUrl(String(form.get("url") ?? ""));
    if (!u) back({ error: "כתובת לא תקינה — צריך אתר שמתחיל ב-https:// (לקישור GitHub השתמשו באפשרות GitHub)" }, kind);
    url = u;
    if (name.length < 2) back({ error: "צריך שם לאפליקציה (לפחות 2 תווים)" }, kind);
  } else {
    const g = normalizeGithubRepo(String(form.get("url") ?? ""));
    if (!g) back({ error: "קישור GitHub לא תקין — למשל https://github.com/owner/repo" }, kind);
    url = g.url;
    if (!name) name = g.repo.slice(0, 30);
  }
  const emojiRaw = String(form.get("emoji") ?? "🔗");
  const emoji = (SUBMISSION_EMOJIS as readonly string[]).includes(emojiRaw) ? emojiRaw : "🔗";
  const iconRaw = kind === "url" ? String(form.get("icon") ?? "") : "";
  const icon = iconRaw ? validIconDataUrl(iconRaw) : null;
  if (iconRaw && !icon) back({ error: "התמונה לא נתמכת — PNG, JPG או WEBP קטנה" }, kind);

  const { rows: pend } = await db.query<{ n: number }>(
    "select count(*)::int as n from public.app_submissions where submitted_by = $1 and status = 'pending'",
    [s.profile.id],
  );
  if ((pend[0]?.n ?? 0) >= MAX_PENDING_PER_USER) back({ error: `יש לך כבר ${MAX_PENDING_PER_USER} הצעות שממתינות לאישור` }, kind);
  const { rows: dup } = await db.query<{ status: string }>(
    "select status from public.app_submissions where kind = $1 and lower(url) = lower($2) and status <> 'rejected' limit 1",
    [kind, url],
  );
  if (dup[0]) back({ error: dup[0].status === "approved" ? "הקישור הזה כבר נמצא באתר" : "מישהו כבר הציע את הקישור הזה — הוא ממתין לאישור" }, kind);

  await db.query(
    "insert into public.app_submissions (kind, name, description, url, emoji, icon, submitted_by) values ($1, $2, $3, $4, $5, $6, $7)",
    [kind, name, description, url, emoji, icon, s.profile.id],
  );
  back({ ok: "ההצעה נשלחה — מנהל האתר יאשר או ידחה אותה" }, kind);
}

/** The submitter withdraws a suggestion that is still pending. */
export async function withdrawSubmission(form: FormData) {
  const s = await requireUser();
  const sid = id(form);
  await (await getDb()).query("delete from public.app_submissions where id = $1 and submitted_by = $2 and status = 'pending'", [sid, s.profile.id]);
  back({ ok: "ההצעה בוטלה" });
}

export async function reviewSubmission(form: FormData) {
  const s = await requireAdmin();
  const sid = id(form);
  const decision = form.get("decision") === "approve" ? "approved" : "rejected";
  const note = cleanText(form.get("note"), 200) || null;
  const db = await getDb();
  const { rows } = await db.query<{ kind: string; name: string }>(
    `update public.app_submissions set status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now()
      where id = $1 and status = 'pending' returning kind, name`,
    [sid, decision, note, s.profile.id],
  );
  if (!rows[0]) back({ error: "ההצעה כבר טופלה" });
  await audit(db, s.profile.id, `app.submission.${decision === "approved" ? "approve" : "reject"}`, sid, { kind: rows[0].kind, name: rows[0].name });
  back({
    ok:
      decision === "rejected"
        ? "ההצעה נדחתה"
        : rows[0].kind === "url"
          ? `"${rows[0].name}" נוסף לדף הבית`
          : `המאגר "${rows[0].name}" נשמר ברשימת מאגרי GitHub`,
  });
}

/** Removes an approved website from the grid / a repository from the list. */
export async function removeSubmission(form: FormData) {
  const s = await requireAdmin();
  const sid = id(form);
  const db = await getDb();
  const { rows } = await db.query<{ kind: string; name: string }>(
    "delete from public.app_submissions where id = $1 and status = 'approved' returning kind, name",
    [sid],
  );
  if (rows[0]) await audit(db, s.profile.id, "app.submission.remove", sid, { kind: rows[0].kind, name: rows[0].name });
  back({ ok: "הוסר" }, rows[0]?.kind);
}
