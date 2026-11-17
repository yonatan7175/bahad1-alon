// Database access shared by the Next.js server and the CLI scripts.
// Two adapters with the same tiny interface:
//   * "pg"     — node-postgres Pool, for Supabase Postgres or any Postgres (Linux self-host)
//   * "pglite" — embedded Postgres (WASM), for local development and tests
// All SQL in the platform is plain Postgres and runs unchanged on both.
import { readdir, readFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type Row = Record<string, unknown>;

export interface Db {
  query<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Runs fn in a transaction. Nested calls reuse the outer transaction. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  /** Run a multi-statement SQL script (no parameters). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  readonly kind: "pg" | "pglite";
}

export type DbOptions =
  | { kind: "pg"; url: string; max?: number; caCert?: string }
  | { kind: "pglite"; dir?: string /* undefined = in-memory */; migrate?: boolean };

export async function createDb(opts: DbOptions): Promise<Db> {
  if (opts.kind === "pg") return createPgDb(opts.url, opts.max, opts.caCert ?? process.env.DATABASE_CA_CERT);
  const db = await createPgliteDb(opts.dir);
  if (opts.migrate !== false) await migrate(db, { shim: true });
  return db;
}

async function createPgDb(url: string, max?: number, caCert?: string): Promise<Db> {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: url,
    max: max ?? Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    ...(caCert ? { ssl: { ca: caCert.replace(/\\n/g, "\n"), rejectUnauthorized: true } } : {}),
  });
  pool.on("error", (e) => console.error("[db] idle client error", e));

  const make = (runner: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }, inTx: boolean): Db => ({
    kind: "pg",
    async query<T = Row>(sql: string, params?: unknown[]) {
      const r = await runner.query(sql, params);
      return { rows: r.rows as T[] };
    },
    async exec(sql: string) {
      await runner.query(sql);
    },
    async tx<T>(fn: (db: Db) => Promise<T>) {
      if (inTx) return fn(this);
      const client = await pool.connect();
      try {
        await client.query("begin");
        const out = await fn(make(client, true));
        await client.query("commit");
        return out;
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      if (!inTx) await pool.end();
    },
  });
  return make(pool, false);
}

async function createPgliteDb(dir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dir) await mkdir(dir, { recursive: true });
  const pg = dir ? await PGlite.create(dir) : await PGlite.create();

  type Runner = { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }>; exec: (s: string) => Promise<unknown> };
  const make = (runner: Runner, inTx: boolean): Db => ({
    kind: "pglite",
    async query<T = Row>(sql: string, params?: unknown[]) {
      const r = await runner.query(sql, params);
      return { rows: r.rows as T[] };
    },
    async exec(sql: string) {
      await runner.exec(sql);
    },
    async tx<T>(fn: (db: Db) => Promise<T>) {
      if (inTx) return fn(this);
      return pg.transaction((t) => fn(make(t as unknown as Runner, true)));
    },
    async close() {
      if (!inTx) await pg.close();
    },
  });
  return make(pg as unknown as Runner, false);
}

// ── Migrations ────────────────────────────────────────────────────────────────

export function projectRoot(): string {
  return process.env.BAHAD_ROOT ?? process.cwd();
}

/**
 * Applies supabase/migrations/*.sql in name order, once each (tracked in
 * public.bahad_migrations). With shim=true, first applies supabase/local/*.sql
 * (stand-ins for Supabase's auth schema) — only for non-Supabase databases.
 */
export async function migrate(db: Db, opts: { shim: boolean; log?: (s: string) => void }): Promise<string[]> {
  const root = projectRoot();
  const log = opts.log ?? (() => {});
  if (opts.shim) {
    const localDir = path.join(root, "supabase", "local");
    for (const f of (await readdir(localDir)).filter((f) => f.endsWith(".sql")).sort()) {
      await db.exec(await readFile(path.join(localDir, f), "utf8"));
    }
  }
  await db.exec(`create table if not exists public.bahad_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set(
    (await db.query<{ name: string }>("select name from public.bahad_migrations")).rows.map((r) => r.name),
  );
  const dir = path.join(root, "supabase", "migrations");
  const files = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(path.join(dir, f), "utf8");
    await db.tx(async (t) => {
      await t.exec(sql);
      await t.query("insert into public.bahad_migrations (name) values ($1)", [f]);
    });
    applied.push(f);
    log(`applied ${f}`);
  }
  return applied;
}
