import "server-only";
// Mock login for local development and the automated tests. Users live in the
// local database's auth.users table (from supabase/local/00_auth_shim.sql).
// authMode() refuses mock mode in production builds unless BAHAD_ALLOW_MOCK=1.
import { getDb } from "../server/db";
import type { Db } from "../server/db-core";
import type { AuthUser } from "./index";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function mockUserById(id: string): Promise<AuthUser | null> {
  if (!uuidRe.test(id)) return null;
  const db = await getDb();
  const { rows } = await db.query<{ id: string; email: string; meta: Record<string, string> }>(
    "select id, email, raw_user_meta_data as meta from auth.users where id = $1",
    [id],
  );
  const u = rows[0];
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.meta?.full_name ?? null, avatarUrl: u.meta?.avatar_url ?? null };
}

export async function listMockUsers(db: Db) {
  const { rows } = await db.query<{ id: string; email: string; full_name: string | null; role: string; status: string }>(
    `select u.id, u.email, p.full_name, p.role, p.status
       from auth.users u left join public.profiles p on p.id = u.id
      order by p.role desc, p.status, u.created_at`,
  );
  return rows;
}

/** Simulates a first Google sign-in: creates the identity; the DB trigger creates a pending profile. */
export async function createMockUser(db: Db, email: string, name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id",
    [email, JSON.stringify({ full_name: name, avatar_url: null })],
  );
  return rows[0].id;
}

/** Seeds a fresh local database with example units and users (idempotent). */
export async function ensureDevSeed(): Promise<void> {
  const db = await getDb();
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from auth.users");
  if ((rows[0]?.n ?? 0) > 0) return;
  await db.tx(async (t) => {
    const companies: Record<string, string> = {};
    const platoons: Record<string, string> = {};
    for (const [i, c] of ["פלוגה א'", "פלוגה ב'"].entries()) {
      // Companies א'–ה' are created by a migration; reuse them.
      const r = await t.query<{ id: string }>(
        "insert into public.companies (name, sort) values ($1, $2) on conflict (name) do update set name = excluded.name returning id",
        [c, i + 1],
      );
      companies[c] = r.rows[0].id;
      for (const p of ["מחלקה 1", "מחלקה 2", "מחלקה 3"]) {
        const pr = await t.query<{ id: string }>("insert into public.platoons (company_id, name) values ($1, $2) returning id", [r.rows[0].id, p]);
        platoons[`${c}/${p}`] = pr.rows[0].id;
      }
    }
    const people: [string, string, string, string | null, string | null, string][] = [
      ["admin@example.com", "מנהל המערכת", "admin", null, null, "approved"],
      ["commander@example.com", "מפקדת פלוגה א'", "commander", "פלוגה א'", null, "approved"],
      ["cadet1@example.com", "ישראל ישראלי", "cadet", "פלוגה א'", "מחלקה 1", "approved"],
      ["cadet2@example.com", "נועה כהן", "cadet", "פלוגה א'", "מחלקה 1", "approved"],
      ["cadet3@example.com", "דניאל לוי", "cadet", "פלוגה א'", "מחלקה 2", "approved"],
      ["cadet4@example.com", "מאיה פרץ", "cadet", "פלוגה ב'", "מחלקה 1", "approved"],
      ["pending@example.com", "חניך חדש", "cadet", "פלוגה ב'", "מחלקה 2", "pending"],
    ];
    for (const [email, name, role, c, p, status] of people) {
      const u = await t.query<{ id: string }>(
        "insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id",
        [email, JSON.stringify({ full_name: name, avatar_url: null })],
      );
      await t.query(
        `update public.profiles set full_name = $2, role = $3::public.user_role, status = $4::public.user_status,
                company_id = $5, platoon_id = $6, onboarded_at = now(), approved_at = $7
          where id = $1`,
        [u.rows[0].id, name, role, status, c ? companies[c] : null, c && p ? platoons[`${c}/${p}`] : null, status === "approved" ? new Date() : null],
      );
    }
  });
}
