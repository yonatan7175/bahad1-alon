import "server-only";
// Username + password sign-in (BAHAD_AUTH=google, next to the Google button).
// The identity is an ordinary auth.users row (no email); public.password_logins holds the username and a
// scrypt hash. The session afterwards is the same signed cookie as Google sign-in (google.ts).
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { Db } from "../server/db-core";

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, len, opts, (e, k) => (e ? reject(e) : resolve(k))));

const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 32;
/** After this many wrong passwords in a row the username is locked for LOCK_MINUTES. */
export const MAX_FAILED = 5;
export const LOCK_MINUTES = 15;

export const USERNAME_RULE = "3–20 תווים: אותיות באנגלית, ספרות, נקודה, מקף או קו תחתון";
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Lower-cased username, or null when it breaks the rule (same regex as the table check). */
export function normalizeUsername(raw: string): string | null {
  const u = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,19}$/.test(u) ? u : null;
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `הסיסמה צריכה להיות לפחות ${PASSWORD_MIN} תווים.`;
  if (pw.length > PASSWORD_MAX) return `הסיסמה ארוכה מדי (עד ${PASSWORD_MAX} תווים).`;
  if (!/[^\d]/.test(pw) || !/\d/.test(pw)) return "הסיסמה צריכה לכלול גם אותיות וגם ספרות.";
  return null;
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, KEY_LEN, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const want = Buffer.from(key, "base64url");
  const got = await scrypt(pw, Buffer.from(salt, "base64url"), want.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem });
  return got.length === want.length && timingSafeEqual(got, want);
}

// Compared against when the username doesn't exist, so a wrong username takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;

export type RegisterResult = { ok: true; userId: string } | { ok: false; error: string };

/** Creates the identity (→ pending profile via the auth.users trigger) and its login. */
export async function registerPasswordUser(db: Db, rawUsername: string, password: string): Promise<RegisterResult> {
  const username = normalizeUsername(rawUsername);
  if (!username) return { ok: false, error: `שם משתמש לא תקין (${USERNAME_RULE}).` };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };
  const hash = await hashPassword(password);
  try {
    const userId = await db.tx(async (t) => {
      const taken = await t.query("select 1 from public.password_logins where username = $1", [username]);
      if (taken.rows.length) return null;
      const { rows } = await t.query<{ id: string }>(
        "insert into auth.users (email, raw_user_meta_data) values (null, $1::jsonb) returning id",
        [JSON.stringify({ username })],
      );
      await t.query("insert into public.password_logins (user_id, username, password_hash) values ($1, $2, $3)", [rows[0].id, username, hash]);
      return rows[0].id;
    });
    if (!userId) return { ok: false, error: "שם המשתמש הזה כבר תפוס. בחרו שם אחר." };
    return { ok: true, userId };
  } catch (e) {
    // Two people registering the same name at the same moment: the unique index decides.
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) return { ok: false, error: "שם המשתמש הזה כבר תפוס. בחרו שם אחר." };
    throw e;
  }
}

export type LoginResult = { ok: true; userId: string } | { ok: false; error: string };

const WRONG = "שם משתמש או סיסמה שגויים.";

export async function loginPasswordUser(db: Db, rawUsername: string, password: string): Promise<LoginResult> {
  const username = normalizeUsername(rawUsername);
  const { rows } = username
    ? await db.query<{ user_id: string; password_hash: string; locked: boolean; banned: boolean }>(
        `select l.user_id, l.password_hash, coalesce(l.locked_until > now(), false) as locked,
                coalesce(u.banned_until > now(), false) as banned
           from public.password_logins l join auth.users u on u.id = l.user_id
          where l.username = $1`,
        [username],
      )
    : { rows: [] };
  const row = rows[0];
  if (!row) {
    dummyHash ??= hashPassword("not-a-real-password-0");
    await verifyPassword(password, await dummyHash);
    return { ok: false, error: WRONG };
  }
  if (row.locked) return { ok: false, error: `יותר מדי ניסיונות שגויים. נסו שוב בעוד ${LOCK_MINUTES} דקות.` };
  if (!(await verifyPassword(password, row.password_hash))) {
    await db.query(
      `update public.password_logins
          set failed_count = case when failed_count + 1 >= $2 then 0 else failed_count + 1 end,
              locked_until = case when failed_count + 1 >= $2 then now() + make_interval(mins => $3) else locked_until end
        where user_id = $1`,
      [row.user_id, MAX_FAILED, LOCK_MINUTES],
    );
    return { ok: false, error: WRONG };
  }
  // Right password but blocked by an admin: say so (the session cookie would not resolve anyway).
  if (row.banned) return { ok: false, error: "החשבון הזה חסום. פנו למנהל האתר." };
  await db.query("update public.password_logins set failed_count = 0, locked_until = null where user_id = $1", [row.user_id]);
  return { ok: true, userId: row.user_id };
}

export async function changePassword(db: Db, userId: string, current: string, next: string): Promise<string | null> {
  const { rows } = await db.query<{ password_hash: string }>("select password_hash from public.password_logins where user_id = $1", [userId]);
  if (!rows[0]) return "לחשבון הזה אין סיסמה (נכנסים עם Google).";
  if (!(await verifyPassword(current, rows[0].password_hash))) return "הסיסמה הנוכחית שגויה.";
  const problem = passwordProblem(next);
  if (problem) return problem;
  await db.query("update public.password_logins set password_hash = $2, failed_count = 0, locked_until = null where user_id = $1", [userId, await hashPassword(next)]);
  return null;
}

export async function usernameOf(db: Db, userId: string): Promise<string | null> {
  const { rows } = await db.query<{ username: string }>("select username from public.password_logins where user_id = $1", [userId]);
  return rows[0]?.username ?? null;
}
