"use server";
// "הוספת אפליקציה": anyone approved suggests; only admins approve / reject / remove. Every action
// re-checks the session and writes the admin's decisions to audit_log.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession, type Session } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { audit } from "@/platform/server/audit";
import { effectiveStatus, getApp, loadOverride } from "@/platform/server/registry";
import { recordEmbedProbe } from "@/platform/server/submissions";
import { isKabam } from "@/platform/auth/connect";
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

  // "התחברות עם צ1" (websites only). Asking for the directory needs the קב״מית's approval.
  const connect = kind === "url" && form.get("connect") === "on";
  const wantDirectory = connect && form.get("want_directory") === "on";
  const { rows: ins } = await db.query<{ id: string }>(
    `insert into public.app_submissions (kind, name, description, url, emoji, icon, submitted_by, connect, want_directory, kabam_status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [kind, name, description, url, emoji, icon, s.profile.id, connect, wantDirectory, kind === "url" ? "pending" : null],
  );
  // So the admin already sees whether the site can open inside the portal.
  if (kind === "url" && ins[0]) await recordEmbedProbe(db, ins[0].id, url);
  back({ ok: kind === "url" ? "ההצעה נשלחה — הקב״מית ומנהל האתר יאשרו אותה" : "ההצעה נשלחה — מנהל האתר יאשר או ידחה אותה" }, kind);
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
  // The קב״מית's directive (/kabam): a website goes live only after her separate approval.
  const { rows: cur } = await db.query<{ kind: string; kabam_status: string | null }>("select kind, kabam_status from public.app_submissions where id = $1", [sid]);
  if (decision === "approved" && cur[0]?.kind === "url" && cur[0].kabam_status !== null && cur[0].kabam_status !== "approved") {
    back({ error: "אי אפשר לאשר עדיין — האתר צריך קודם אישור קב״מית" });
  }
  const { rows } = await db.query<{ kind: string; name: string; url: string }>(
    `update public.app_submissions set status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now()
      where id = $1 and status = 'pending' returning kind, name, url`,
    [sid, decision, note, s.profile.id],
  );
  if (!rows[0]) back({ error: "ההצעה כבר טופלה" });
  // Fresh check at approval time (the site may have changed since it was suggested).
  const probe = decision === "approved" && rows[0].kind === "url" ? await recordEmbedProbe(db, sid, rows[0].url) : null;
  await audit(db, s.profile.id, `app.submission.${decision === "approved" ? "approve" : "reject"}`, sid, { kind: rows[0].kind, name: rows[0].name });
  back({
    ok:
      decision === "rejected"
        ? "ההצעה נדחתה"
        : rows[0].kind === "url"
          ? `"${rows[0].name}" נוסף לדף הבית — ${probe?.embedUrl ? "נפתח בתוך האתר" : "נפתח בלשונית חדשה (האתר לא מאפשר הצגה בפנים)"}`
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

/** Checks again whether an approved / pending website can open inside the portal. */
export async function recheckEmbed(form: FormData) {
  await requireAdmin();
  const sid = id(form);
  const db = await getDb();
  const { rows } = await db.query<{ url: string; name: string; status: string }>(
    "select url, name, status from public.app_submissions where id = $1 and kind = 'url' and status <> 'rejected'",
    [sid],
  );
  if (!rows[0]) back({ error: "לא נמצא" });
  const r = await recordEmbedProbe(db, sid, rows[0].url);
  back({ ok: `"${rows[0].name}": ${r.note}` }, rows[0].status === "approved" ? "url" : undefined);
}

/** Re-checks every approved website (e.g. sites approved before in-portal opening existed). */
export async function recheckAllEmbeds() {
  const s = await requireAdmin();
  const db = await getDb();
  const { rows } = await db.query<{ id: string; url: string }>(
    "select id, url from public.app_submissions where kind = 'url' and status = 'approved' order by embed_checked_at asc nulls first limit 40",
  );
  let inside = 0;
  for (let i = 0; i < rows.length; i += 4) {
    const batch = await Promise.all(rows.slice(i, i + 4).map((r) => recordEmbedProbe(db, r.id, r.url)));
    inside += batch.filter((b) => b.embedUrl).length;
  }
  await audit(db, s.profile.id, "app.submission.recheck_all", null, { checked: rows.length, inside });
  back({ ok: `נבדקו ${rows.length} אתרים — ${inside} נפתחים בתוך האתר` });
}

/** The admin's choice for one approved website: follow the check (auto), always inside (frame) or always a new tab (tab). */
export async function setEmbedMode(form: FormData) {
  const s = await requireAdmin();
  const sid = id(form);
  const raw = String(form.get("mode") ?? "");
  const mode = raw === "frame" || raw === "tab" ? raw : "auto";
  const db = await getDb();
  const { rows } = await db.query<{ name: string }>(
    "update public.app_submissions set embed_mode = $2 where id = $1 and kind = 'url' and status = 'approved' returning name",
    [sid, mode],
  );
  if (!rows[0]) back({ error: "לא נמצא" });
  await audit(db, s.profile.id, "app.submission.embed_mode", sid, { mode, name: rows[0].name });
  back({ ok: mode === "tab" ? `"${rows[0].name}" ייפתח בלשונית חדשה` : mode === "frame" ? `"${rows[0].name}" ייפתח תמיד בתוך האתר` : `"${rows[0].name}" — לפי הבדיקה האוטומטית` });
}

/**
 * The קב״מית's decision on a website (holders of the קב״מית position only — not admins as such).
 * decision: approve / reject. `directory` grants the battalion directory to a connected site that asked
 * for it. She can also take an approval back later ("revoke"): the site's tokens stop working at once.
 */
export async function kabamReview(form: FormData) {
  const s = await requireUser();
  const db = await getDb();
  if (!(await isKabam(db, s.profile.id))) back({ error: "רק הקב״מית יכולה לאשר אתרים" });
  const sid = id(form);
  const decision = String(form.get("decision") ?? "");
  const note = cleanText(form.get("note"), 200) || null;
  const directory = form.get("directory") === "on";
  if (decision === "approve" || decision === "reject") {
    const { rows } = await db.query<{ name: string; directory_allowed: boolean }>(
      `update public.app_submissions
          set kabam_status = $2, kabam_note = $3, kabam_by = $4, kabam_at = now(),
              directory_allowed = ($2 = 'approved' and connect and want_directory and $5)
        where id = $1 and kind = 'url' and status = 'pending' and kabam_status = 'pending'
        returning name, directory_allowed`,
      [sid, decision === "approve" ? "approved" : "rejected", note, s.profile.id, directory],
    );
    if (!rows[0]) back({ error: "ההצעה כבר טופלה" });
    // A rejection by the קב״מית closes the suggestion.
    if (decision === "reject") {
      await db.query("update public.app_submissions set status = 'rejected', review_note = coalesce(review_note, $2) where id = $1", [sid, note ? `קב״מית: ${note}` : "לא אושר ע״י הקב״מית"]);
    }
    await audit(db, s.profile.id, `app.submission.kabam_${decision}`, sid, { name: rows[0].name, directory: rows[0].directory_allowed });
    back({ ok: decision === "approve" ? `"${rows[0].name}" אושר ע״י הקב״מית — עכשיו מנהל האתר יכול להוסיף אותו` : `"${rows[0].name}" לא אושר` });
  }
  if (decision === "directory" || decision === "revoke") {
    const { rows } = await db.query<{ name: string }>(
      decision === "directory"
        ? "update public.app_submissions set directory_allowed = (want_directory and $2) where id = $1 and connect and kabam_status = 'approved' returning name"
        : "update public.app_submissions set kabam_status = 'rejected', directory_allowed = false, kabam_by = $2, kabam_at = now() where id = $1 and kabam_status = 'approved' returning name",
      decision === "directory" ? [sid, directory] : [sid, s.profile.id],
    );
    if (!rows[0]) back({ error: "האתר לא נמצא" });
    if (decision === "revoke") await db.query("delete from public.oauth_tokens where site_id = $1", [sid]);
    if (decision === "directory" && !directory) await db.query("update public.oauth_tokens set directory = false where site_id = $1", [sid]);
    await audit(db, s.profile.id, `app.submission.kabam_${decision}`, sid, { name: rows[0].name, directory });
    back({ ok: decision === "revoke" ? `האישור של "${rows[0].name}" בוטל — האתר מנותק` : directory ? "הגישה לרשימת האנשים אושרה" : "הגישה לרשימת האנשים בוטלה" });
  }
  back({ error: "פעולה לא מוכרת" });
}
