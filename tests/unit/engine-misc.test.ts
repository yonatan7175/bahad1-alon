import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/generated/registry", () => import("../support/registry-fixture"));
import { executeCall, LIMITS } from "@/platform/server/engine";
import type { Db } from "@/platform/server/db-core";
import { sendDuePush, dailyCleanup, saveSubscription, type PushSender } from "@/platform/server/push";
import { company, platoon, rawRecord, testDb, user, type TestUser } from "../support/db";

let db: Db;
const U: Record<string, TestUser> = {};
let A: string, B: string, A1: string, B1: string;
const published: string[] = [];

beforeAll(async () => {
  db = await testDb();
  A = await company(db, "A");
  B = await company(db, "B");
  A1 = await platoon(db, A, "1");
  B1 = await platoon(db, B, "1");
  U.cadet = await user(db, "חניך א", { companyId: A, platoonId: A1, phone: "050-1234567" });
  U.cadet2 = await user(db, "חניך ב", { companyId: A, platoonId: A1 });
  U.cadetB = await user(db, "חניך ג", { companyId: B, platoonId: B1 });
  U.cmd = await user(db, "מפקד", { role: "commander", companyId: A });
  U.admin = await user(db, "אדמין", { role: "admin" });
  U.pending = await user(db, "ממתין", { status: "pending" });
  U.blocked = await user(db, "חסום", { status: "blocked" });
});

beforeEach(async () => {
  await db.query("delete from public.rate_counters");
  await db.query("delete from public.app_overrides");
  published.length = 0;
});

const deps = () => ({ db, publish: (s: string, c: string) => void published.push(`${s}:${c}`) });
const call = (u: TestUser | null, slug: string, method: string, params: object = {}) =>
  executeCall(deps(), { userId: u?.id ?? null, slug }, method, params);

describe("session and app checks", () => {
  it("rejects anonymous, pending and blocked users", async () => {
    await expect(call(null, "bare", "user.me")).rejects.toMatchObject({ code: "unauthorized" });
    await expect(call({ ...U.cadet, id: crypto.randomUUID() }, "bare", "user.me")).rejects.toMatchObject({ code: "unauthorized" });
    await expect(call(U.pending, "bare", "user.me")).rejects.toMatchObject({ code: "forbidden" });
    await expect(call(U.blocked, "bare", "user.me")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("re-checks status on every call (blocking takes effect immediately)", async () => {
    const u = await user(db, "יוצא", {});
    await expect(call(u, "bare", "user.me")).resolves.toBeTruthy();
    await db.query("update public.profiles set status = 'blocked' where id = $1", [u.id]);
    await expect(call(u, "bare", "user.me")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("unknown app / unknown method", async () => {
    await expect(call(U.cadet, "nope", "user.me")).rejects.toMatchObject({ code: "not_found" });
    await expect(call(U.cadet, "bare", "user.delete")).rejects.toMatchObject({ code: "invalid" });
  });

  it("kill switch: disabled refuses everyone, hidden allows admins only", async () => {
    await db.query("insert into public.app_overrides (app_slug, status) values ('bare', 'disabled')");
    await expect(call(U.cadet, "bare", "user.me")).rejects.toMatchObject({ code: "app_disabled" });
    await expect(call(U.admin, "bare", "user.me")).rejects.toMatchObject({ code: "app_disabled" });
    await db.query("update public.app_overrides set status = 'hidden' where app_slug = 'bare'");
    await expect(call(U.cadet, "bare", "user.me")).rejects.toMatchObject({ code: "forbidden" });
    await expect(call(U.admin, "bare", "user.me")).resolves.toBeTruthy();
  });

  it("manifest status hidden ⇒ admins only; audience is enforced", async () => {
    await expect(call(U.cadet, "hidden-app", "user.me")).rejects.toMatchObject({ code: "forbidden" });
    await expect(call(U.admin, "hidden-app", "user.me")).resolves.toBeTruthy();
    await expect(call(U.cadet, "cmd-only", "user.me")).rejects.toMatchObject({ code: "forbidden" });
    await expect(call(U.cmd, "cmd-only", "user.me")).resolves.toBeTruthy();
  });
});

describe("user.me scopes", () => {
  it("profile only by default", async () => {
    const me = await call(U.cadet, "bare", "user.me");
    expect(me).toEqual({ id: U.cadet.id, name: "חניך א", avatarUrl: "https://example.com/a.png" });
  });
  it("role + unit + contact when declared", async () => {
    const me = (await call(U.cadet, "full-scopes", "user.me")) as Record<string, unknown>;
    expect(me.role).toBe("cadet");
    expect(me.company).toEqual({ id: A, name: "A" });
    expect(me.platoon).toEqual({ id: A1, name: "1" });
    expect(me.email).toMatch(/@example\.com$/);
    expect(me.phone).toBe("050-1234567");
  });
  it("commander without platoon gets platoon: null", async () => {
    const me = (await call(U.cmd, "full-scopes", "user.me")) as Record<string, unknown>;
    expect(me.platoon).toBeNull();
  });
});

describe("data API", () => {
  it("needs the data scope and a declared collection", async () => {
    await expect(call(U.cadet, "bare", "data.list", { collection: "x" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(call(U.cadet, "full-scopes", "data.list", { collection: "nope" })).rejects.toMatchObject({ code: "not_found" });
    await expect(call(U.cadet, "full-scopes", "data.list", { collection: "__proto__" })).rejects.toMatchObject({ code: "not_found" });
    await expect(call(U.cadet, "full-scopes", "data.list", { collection: "toString" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("apps cannot see each other's data", async () => {
    await call(U.cadet, "other", "data.add", { collection: "notes", data: { app: "other" } });
    const list = (await call(U.cadet, "full-scopes", "data.list", { collection: "notes" })) as unknown[];
    expect(list.every((r) => (r as { data: { app?: string } }).data.app !== "other")).toBe(true);
  });

  it("add / get / update (shallow merge) / remove and change signals", async () => {
    const rec = (await call(U.cadet, "full-scopes", "data.add", { collection: "notes", data: { a: 1, nested: { x: 1 } } })) as {
      id: string;
      createdAt: string;
    };
    expect(rec).toMatchObject({ data: { a: 1 }, mine: true, owner: { id: U.cadet.id, name: "חניך א" } });
    expect(new Date(rec.createdAt).toISOString()).toBe(rec.createdAt);
    const upd = await call(U.cadet, "full-scopes", "data.update", { collection: "notes", id: rec.id, patch: { b: 2, nested: { y: 2 } } });
    expect(upd).toMatchObject({ data: { a: 1, b: 2, nested: { y: 2 } } });
    await expect(call(U.cadet, "full-scopes", "data.get", { collection: "notes", id: rec.id })).resolves.toMatchObject({ data: { b: 2 } });
    await call(U.cadet, "full-scopes", "data.remove", { collection: "notes", id: rec.id });
    await expect(call(U.cadet, "full-scopes", "data.get", { collection: "notes", id: rec.id })).rejects.toMatchObject({ code: "not_found" });
    expect(published).toEqual(["full-scopes:notes", "full-scopes:notes", "full-scopes:notes"]);
  });

  it("maxPerUser is enforced, also under concurrency", async () => {
    await db.query("delete from public.app_records where collection = 'notes' and owner_id = $1", [U.cadet2.id]);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => call(U.cadet2, "full-scopes", "data.add", { collection: "notes", data: { i } })),
    );
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(3);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason.code === "rate_limited")).toBe(true);
  });

  it("rejects non-objects, >16 KB, NUL characters and invalid ids", async () => {
    for (const data of [null, 5, "x", [1, 2]]) {
      await expect(call(U.cadet, "full-scopes", "data.add", { collection: "typed", data })).rejects.toMatchObject({ code: "invalid" });
    }
    const big = { title: "x".repeat(LIMITS.recordBytes) };
    await expect(call(U.cadet, "other", "data.add", { collection: "notes", data: big })).rejects.toMatchObject({ code: "invalid" });
    await expect(call(U.cadet, "other", "data.add", { collection: "notes", data: { t: "a\u0000b" } })).rejects.toMatchObject({ code: "invalid" });
    await expect(call(U.cadet, "other", "data.get", { collection: "notes", id: "1 or 1=1" })).rejects.toMatchObject({ code: "not_found" });
    await expect(call(U.cadet, "other", "data.get", { collection: "notes", id: crypto.randomUUID() })).rejects.toMatchObject({ code: "not_found" });
  });

  it("validates against the collection JSON Schema on add and on (merged) update", async () => {
    await expect(call(U.cadet, "full-scopes", "data.add", { collection: "typed", data: { n: 1 } })).rejects.toMatchObject({ code: "invalid" });
    await expect(call(U.cadet, "full-scopes", "data.add", { collection: "typed", data: { title: "toolongtitle!" } })).rejects.toMatchObject({ code: "invalid" });
    const r = (await call(U.cadet, "full-scopes", "data.add", { collection: "typed", data: { title: "ok", n: 2 } })) as { id: string };
    await expect(call(U.cadet, "full-scopes", "data.update", { collection: "typed", id: r.id, patch: { extra: true } })).rejects.toMatchObject({ code: "invalid" });
    await expect(call(U.cadet, "full-scopes", "data.update", { collection: "typed", id: r.id, patch: { n: 3 } })).resolves.toMatchObject({ data: { title: "ok", n: 3 } });
  });

  it("list: where (top-level equality), order, limit, and option validation", async () => {
    await db.query("delete from public.app_records where app_slug = 'other'");
    for (let i = 0; i < 5; i++) await call(U.cadet, "other", "data.add", { collection: "notes", data: { i, even: i % 2 === 0, tag: "t" } });
    const evens = (await call(U.cadet, "other", "data.list", { collection: "notes", options: { where: { even: true } } })) as { data: { i: number } }[];
    expect(evens.map((r) => r.data.i).sort()).toEqual([0, 2, 4]);
    const asc = (await call(U.cadet, "other", "data.list", { collection: "notes", options: { order: "createdAt:asc", limit: 2 } })) as { data: { i: number } }[];
    expect(asc.map((r) => r.data.i)).toEqual([0, 1]);
    const desc = (await call(U.cadet, "other", "data.list", { collection: "notes" })) as { data: { i: number } }[];
    expect(desc[0].data.i).toBe(4);
    for (const options of [{ limit: 201 }, { limit: 0 }, { order: "id" }, { where: { a: { nested: 1 } } }, { where: { a: [1] } }, { bogus: 1 }]) {
      await expect(call(U.cadet, "other", "data.list", { collection: "notes", options })).rejects.toMatchObject({ code: "invalid" });
    }
  });

  it("rate limit: 60 writes per minute per user per app", async () => {
    await db.query("delete from public.app_records where app_slug = 'other'");
    for (let i = 0; i < LIMITS.writesPerMinute; i++) await call(U.cadetB, "other", "data.add", { collection: "notes", data: { i } });
    await expect(call(U.cadetB, "other", "data.add", { collection: "notes", data: {} })).rejects.toMatchObject({ code: "rate_limited" });
    // other users are not affected
    await expect(call(U.cadet, "other", "data.add", { collection: "notes", data: {} })).resolves.toBeTruthy();
  });

  it("data.access checks the collection without returning data", async () => {
    await expect(call(U.cadet, "other", "data.access", { collection: "notes" })).resolves.toBeNull();
    await expect(call(U.cadet, "other", "data.access", { collection: "x" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("push", () => {
  beforeEach(async () => {
    await db.query("delete from public.push_queue");
  });

  it("needs the push scope", async () => {
    await expect(call(U.cadet, "bare", "push.notify", { options: { to: "me", title: "x" } })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("to: me queues one row; url is confined to the app", async () => {
    const r = (await call(U.cadet, "pushy", "push.notify", { options: { to: "me", title: "שלום" } })) as { id: string; recipients: number };
    expect(r.recipients).toBe(1);
    const { rows } = await db.query<{ url: string; user_id: string }>("select url, user_id from public.push_queue where batch_id = $1", [r.id]);
    expect(rows).toEqual([{ url: "/a/pushy", user_id: U.cadet.id }]);
    for (const url of ["/a/pushyx", "https://evil.com", "//evil.com", "/a/pushy//evil", "/a/other", "/a/pushy\\x", "javascript:alert(1)"]) {
      await expect(call(U.cadet, "pushy", "push.notify", { options: { to: "me", title: "x", url } }), url).rejects.toMatchObject({ code: "invalid" });
    }
    await expect(call(U.cadet, "pushy", "push.notify", { options: { to: "me", title: "x", url: "/a/pushy?day=2" } })).resolves.toBeTruthy();
  });

  it("validates time window and lengths", async () => {
    const past = new Date(Date.now() - 10 * 60_000).toISOString();
    const far = new Date(Date.now() + 31 * 86400_000).toISOString();
    for (const options of [
      { to: "me", title: "x", at: past },
      { to: "me", title: "x", at: far },
      { to: "me", title: "x", at: "2026-11-20T18:00:00" }, // no offset
      { to: "me", title: "" },
      { to: "me", title: "x".repeat(81) },
      { to: "me", title: "x", body: "x".repeat(301) },
      { to: "everyone", title: "x" },
    ]) {
      await expect(call(U.cadet, "pushy", "push.notify", { options }), JSON.stringify(options)).rejects.toMatchObject({ code: "invalid" });
    }
    await expect(
      call(U.cadet, "pushy", "push.notify", { options: { to: "me", title: "x", at: new Date(Date.now() + 3600_000).toISOString().replace("Z", "+00:00") } }),
    ).resolves.toBeTruthy();
  });

  it("unit targets: cadets never; commanders only their company; admins anywhere", async () => {
    await expect(call(U.cadet, "pushy", "push.notify", { options: { to: { platoon: A1 }, title: "x" } })).rejects.toMatchObject({ code: "forbidden" });
    await expect(call(U.cmd, "pushy", "push.notify", { options: { to: { platoon: B1 }, title: "x" } })).rejects.toMatchObject({ code: "forbidden" });
    await expect(call(U.cmd, "pushy", "push.notify", { options: { to: { company: B }, title: "x" } })).rejects.toMatchObject({ code: "forbidden" });
    const p = (await call(U.cmd, "pushy", "push.notify", { options: { to: { platoon: A1 }, title: "x" } })) as { recipients: number };
    expect(p.recipients).toBe(2); // cadet + cadet2 (approved, platoon A1)
    const c = (await call(U.cmd, "pushy", "push.notify", { options: { to: { company: A }, title: "x" } })) as { recipients: number };
    expect(c.recipients).toBe(3); // cadet, cadet2, cmd
    const b = (await call(U.admin, "pushy", "push.notify", { options: { to: { company: B }, title: "x" } })) as { recipients: number };
    expect(b.recipients).toBe(1);
    await expect(call(U.admin, "pushy", "push.notify", { options: { to: { platoon: crypto.randomUUID() }, title: "x" } })).rejects.toMatchObject({ code: "not_found" });
  });

  it("quota: 20 notify calls per day per user per app", async () => {
    for (let i = 0; i < LIMITS.pushPerDay; i++) await call(U.cadet2, "pushy", "push.notify", { options: { to: "me", title: `n${i}` } });
    await expect(call(U.cadet2, "pushy", "push.notify", { options: { to: "me", title: "x" } })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("cancel removes only the sender's own unsent notifications", async () => {
    const at = new Date(Date.now() + 3600_000).toISOString();
    const r = (await call(U.cmd, "pushy", "push.notify", { options: { to: { company: A }, title: "x", at } })) as { id: string };
    await expect(call(U.cadet, "pushy", "push.cancel", { id: r.id })).rejects.toMatchObject({ code: "not_found" });
    await expect(call(U.cmd, "pushy", "push.cancel", { id: r.id })).resolves.toBeNull();
    const { rows } = await db.query("select 1 from public.push_queue where batch_id = $1", [r.id]);
    expect(rows.length).toBe(0);
  });

  it("sender delivers due rows to every device, removes expired devices, skips future rows", async () => {
    await db.query("delete from public.push_subscriptions");
    await saveSubscription(db, U.cadet.id, { endpoint: "https://push.example/ok", p256dh: "BPxxxxxxxxxx", auth: "authauthauth" }, "ua");
    await saveSubscription(db, U.cadet.id, { endpoint: "https://push.example/gone", p256dh: "BPxxxxxxxxxx", auth: "authauthauth" }, "ua");
    await call(U.cadet, "pushy", "push.notify", { options: { to: "me", title: "now" } });
    await call(U.cadet, "pushy", "push.notify", { options: { to: "me", title: "later", at: new Date(Date.now() + 3600_000).toISOString() } });
    await call(U.cadet2, "pushy", "push.notify", { options: { to: "me", title: "no device" } });
    const sent: string[] = [];
    const sender: PushSender = async (sub, payload) => {
      sent.push(`${sub.endpoint}|${payload.title}|${payload.url}`);
      return sub.endpoint.endsWith("gone") ? 410 : 201;
    };
    const res = await sendDuePush(db, sender);
    expect(res).toEqual({ claimed: 2, delivered: 1, failed: 1, removedSubscriptions: 1 });
    expect(sent.sort()).toEqual(["https://push.example/gone|now|/a/pushy", "https://push.example/ok|now|/a/pushy"]);
    const { rows } = await db.query<{ endpoint: string }>("select endpoint from public.push_subscriptions");
    expect(rows.map((r) => r.endpoint)).toEqual(["https://push.example/ok"]);
    // second run: nothing due (at-most-once), future row still queued
    expect((await sendDuePush(db, sender)).claimed).toBe(0);
    const q = await db.query<{ n: number }>("select count(*)::int as n from public.push_queue where sent_at is null");
    expect(q.rows[0].n).toBe(1);
    const err = await db.query<{ error: string }>("select error from public.push_queue where title = 'no device'");
    expect(err.rows[0].error).toBe("no_subscription");
  });

  it("daily cleanup deletes old sent rows and old counters", async () => {
    await db.query(
      `insert into public.push_queue (batch_id, app_slug, user_id, title, sent_at) values (gen_random_uuid(), 'pushy', $1, 'old', now() - interval '31 days')`,
      [U.cadet.id],
    );
    await db.query(`insert into public.rate_counters (key, window_start, count) values ('k', now() - interval '3 days', 1)`);
    expect(await dailyCleanup(db)).toEqual({ pushRowsDeleted: 1, counterRowsDeleted: 1 });
  });
});

describe("database security (RLS)", () => {
  it("a signed-in browser can read only its own profile and nothing else", async () => {
    await rawRecord(db, "other", "notes", U.cadet2.id, { secret: true });
    await db.tx(async (t) => {
      await t.exec("set local role authenticated");
      await t.query("select set_config('request.jwt.claim.sub', $1, true)", [U.cadet.id]);
      const { rows } = await t.query<{ id: string }>("select id from public.profiles");
      expect(rows.map((r) => r.id)).toEqual([U.cadet.id]);
    });
    for (const sql of [
      "select * from public.app_records",
      "select * from public.audit_log",
      "select * from public.push_subscriptions",
      "select * from public.companies",
      "update public.profiles set role = 'admin'",
      "insert into public.app_records (app_slug, collection, owner_id, data) values ('x','y',gen_random_uuid(),'{}')",
    ]) {
      await expect(
        db.tx(async (t) => {
          await t.exec("set local role authenticated");
          await t.query("select set_config('request.jwt.claim.sub', $1, true)", [U.cadet.id]);
          await t.query(sql);
        }),
        sql,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("anonymous browsers can read nothing", async () => {
    await expect(
      db.tx(async (t) => {
        await t.exec("set local role anon");
        await t.query("select * from public.profiles");
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("profile trigger and unit consistency check", async () => {
    const { rows } = await db.query<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ('g@example.com', '{\"name\":\"גוגל\",\"picture\":\"https://p\"}') returning id",
    );
    const p = await db.query<{ full_name: string; avatar_url: string; status: string; role: string }>(
      "select full_name, avatar_url, status, role from public.profiles where id = $1",
      [rows[0].id],
    );
    expect(p.rows[0]).toEqual({ full_name: "גוגל", avatar_url: "https://p", status: "pending", role: "cadet" });
    await expect(db.query("update public.profiles set company_id = $2, platoon_id = $3 where id = $1", [rows[0].id, A, B1])).rejects.toThrow(
      /platoon does not belong/,
    );
    await expect(db.query("update public.profiles set company_id = null, platoon_id = $2 where id = $1", [rows[0].id, A1])).rejects.toThrow(
      /platoon does not belong/,
    );
  });
});
