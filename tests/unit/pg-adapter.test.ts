// Runs the PRODUCTION database path (node-postgres over the wire protocol, as used with
// Supabase or a Linux Postgres) against PGlite served on a local TCP socket.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/generated/registry", () => import("../support/registry-fixture"));
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createDb, migrate, type Db } from "@/platform/server/db-core";
import { executeCall } from "@/platform/server/engine";
import { sendDuePush, saveSubscription } from "@/platform/server/push";

let pg: PGlite;
let server: PGLiteSocketServer;
let db: Db;
const PORT = 54329;

beforeAll(async () => {
  pg = await PGlite.create();
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1" });
  await server.start();
  db = await createDb({ kind: "pg", url: `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`, max: 1 });
  // what `pnpm db:migrate --shim` does on a plain Linux Postgres
  const applied = await migrate(db, { shim: true });
  expect(applied.length).toBeGreaterThan(0);
  expect(await migrate(db, { shim: true })).toEqual([]); // idempotent
});

afterAll(async () => {
  await db?.close();
  await server?.stop();
  await pg?.close();
});

describe("pg adapter (production path)", () => {
  it("types come back the same as with PGlite (uuid strings, Date, parsed jsonb, int counts)", async () => {
    const { rows } = await db.query<{ id: string; d: Date; j: { a: number }; n: number }>(
      "select gen_random_uuid() as id, now() as d, '{\"a\":1}'::jsonb as j, count(*)::int as n from (select 1) x",
    );
    expect(typeof rows[0].id).toBe("string");
    expect(rows[0].d).toBeInstanceOf(Date);
    expect(rows[0].j).toEqual({ a: 1 });
    expect(rows[0].n).toBe(1);
  });

  it("transactions commit and roll back", async () => {
    await db.exec("create table if not exists t_tx (x int)");
    await db.tx(async (t) => t.query("insert into t_tx values (1)"));
    await expect(
      db.tx(async (t) => {
        await t.query("insert into t_tx values (2)");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const { rows } = await db.query<{ x: number }>("select x from t_tx order by x");
    expect(rows.map((r) => r.x)).toEqual([1]);
  });

  it("the engine works end to end over pg (add/list/update/remove, push queue + sender)", async () => {
    const c = (await db.query<{ id: string }>("insert into public.companies (name) values ('A') returning id")).rows[0].id;
    const p = (await db.query<{ id: string }>("insert into public.platoons (company_id, name) values ($1, '1') returning id", [c])).rows[0].id;
    const u = (await db.query<{ id: string }>("insert into auth.users (email, raw_user_meta_data) values ('x@example.com', '{\"full_name\":\"איקס\"}') returning id")).rows[0].id;
    await db.query("update public.profiles set status = 'approved', company_id = $2, platoon_id = $3 where id = $1", [u, c, p]);
    const deps = { db };
    const call = (m: string, params: object) => executeCall(deps, { userId: u, slug: "full-scopes" }, m, params);
    const r = (await call("data.add", { collection: "notes", data: { a: 1 } })) as { id: string };
    expect(await call("data.list", { collection: "notes", options: { where: { a: 1 } } })).toHaveLength(1);
    await expect(call("data.update", { collection: "notes", id: r.id, patch: { b: 2 } })).resolves.toMatchObject({ data: { a: 1, b: 2 } });
    await call("data.remove", { collection: "notes", id: r.id });
    const me = (await call("user.me", {})) as { company: { name: string } };
    expect(me.company.name).toBe("A");

    await saveSubscription(db, u, { endpoint: "https://push.example/1", p256dh: "BPxxxxxxxxxx", auth: "authauthauth" }, null);
    await call("push.notify", { options: { to: "me", title: "hi" } });
    const sent: string[] = [];
    const res = await sendDuePush(db, async (s, payload) => {
      sent.push(payload.title);
      return 201;
    });
    expect(res.delivered).toBe(1);
    expect(sent).toEqual(["hi"]);
  });
});
