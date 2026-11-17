// Applies supabase/migrations/*.sql to DATABASE_URL (Supabase or any Postgres).
//   pnpm db:migrate            — Supabase project (auth schema already exists)
//   pnpm db:migrate --shim     — plain Postgres (Linux self-host): also applies supabase/local/*.sql
// Use a DIRECT or SESSION-pooler connection string here (not the transaction pooler).
import { createDb, migrate } from "../src/platform/server/db-core";

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = await createDb({ kind: "pg", url, max: 1 });
  try {
    const applied = await migrate(db, { shim: process.argv.includes("--shim"), log: (s) => console.log("  " + s) });
    console.log(applied.length ? `✔ applied ${applied.length} migration(s)` : "✔ database is up to date");
  } finally {
    await db.close();
  }
})().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exit(1);
});
