// End-of-course data retention (plan 10 — Other measures, plan 11 — Phase 6).
//   pnpm course-end export [--out file.json]          — every app record + user list → JSON (mode 600). Encrypt/move it!
//   pnpm course-end delete-records [--app <slug>] [--yes]
//   pnpm course-end remove-users [--inactive-days 30] [--yes]
// Without --yes it only prints what WOULD happen (dry run). Admins are never removed.
// Needs DATABASE_URL (or the local PGlite dir). On Supabase, also SUPABASE_SERVICE_ROLE_KEY +
// NEXT_PUBLIC_SUPABASE_URL so identities are deleted through the Auth admin API.
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createDb, type Db } from "../src/platform/server/db-core";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const yes = process.argv.includes("--yes");

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  return url ? createDb({ kind: "pg", url, max: 1 }) : createDb({ kind: "pglite", dir: process.env.BAHAD_PGLITE_DIR ?? ".data/pglite" });
}

async function exportAll(db: Db) {
  const records = (await db.query("select r.*, p.full_name as owner_name from public.app_records r join public.profiles p on p.id = r.owner_id order by app_slug, collection, created_at")).rows;
  const users = (
    await db.query(
      `select p.id, p.email, p.full_name, p.role, p.status, c.name as company, pl.name as platoon, p.created_at, p.last_seen_at
         from public.profiles p left join public.companies c on c.id = p.company_id left join public.platoons pl on pl.id = p.platoon_id`,
    )
  ).rows;
  const out = arg("out") ?? path.join("backups", `course-end-${new Date().toISOString().slice(0, 10)}.json`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ exportedAt: new Date().toISOString(), users, records }, null, 2), { mode: 0o600 });
  console.log(`✔ exported ${records.length} records and ${users.length} users → ${out}`);
  console.log("⚠ This file contains personal data. Encrypt it (age/gpg) and store it where the owner decided (plan Q7), then delete the plain file.");
}

async function deleteRecords(db: Db) {
  const app = arg("app");
  const where = app ? "where app_slug = $1" : "";
  const params = app ? [app] : [];
  const { rows } = await db.query<{ app_slug: string; n: number }>(`select app_slug, count(*)::int as n from public.app_records ${where} group by app_slug order by app_slug`, params);
  for (const r of rows) console.log(`  ${r.app_slug}: ${r.n} records`);
  if (!yes) return console.log("(dry run — add --yes to delete)");
  await db.query(`delete from public.app_records ${where}`, params);
  await db.query(`delete from public.push_queue ${app ? "where app_slug = $1" : ""}`, params);
  console.log("✔ deleted");
}

async function removeUsers(db: Db) {
  const days = Number(arg("inactive-days") ?? 30);
  if (!Number.isFinite(days) || days < 1) throw new Error("--inactive-days must be ≥ 1");
  const { rows } = await db.query<{ id: string; email: string; full_name: string | null; last_seen_at: Date | null }>(
    `select id, email, full_name, last_seen_at from public.profiles
      where role <> 'admin' and coalesce(last_seen_at, created_at) < now() - make_interval(days => $1)
      order by last_seen_at nulls first`,
    [days],
  );
  for (const u of rows) console.log(`  ${u.full_name ?? "(no name)"} <${u.email}> last seen ${u.last_seen_at?.toISOString?.() ?? "never"}`);
  console.log(`${rows.length} user(s) inactive for ${days}+ days`);
  if (!yes) return console.log("(dry run — add --yes to remove them and all their data)");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const u of rows) {
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) console.error(`  ✖ ${u.email}: ${error.message}`);
      // Own Postgres with Supabase Auth (BAHAD_AUTH_SHIM=1): also delete the local mirror (cascades to the profile).
      else if (process.env.BAHAD_AUTH_SHIM === "1") await db.query("delete from auth.users where id = $1", [u.id]);
    }
  } else {
    for (const u of rows) await db.query("delete from auth.users where id = $1", [u.id]);
  }
  console.log("✔ removed");
}

(async () => {
  const cmd = process.argv[2];
  const db = await open();
  try {
    if (cmd === "export") await exportAll(db);
    else if (cmd === "delete-records") await deleteRecords(db);
    else if (cmd === "remove-users") await removeUsers(db);
    else console.error("usage: pnpm course-end export | delete-records [--app slug] [--yes] | remove-users [--inactive-days N] [--yes]");
  } finally {
    await db.close();
  }
})().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exit(1);
});
