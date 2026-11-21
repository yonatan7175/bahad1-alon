// unique slots + per-week quotas + list({ mine }) — what the laundry calendar relies on.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/generated/registry", () => import("../support/registry-fixture"));
import { executeCall } from "@/platform/server/engine";
import type { Db } from "@/platform/server/db-core";
import { company, platoon, testDb, user, type TestUser } from "../support/db";

let db: Db;
const U: Record<string, TestUser> = {};
beforeAll(async () => {
  db = await testDb();
  const A = await company(db, "A");
  const A1 = await platoon(db, A, "1");
  U.a = await user(db, "א", { companyId: A, platoonId: A1 });
  U.b = await user(db, "ב", { companyId: A, platoonId: A1 });
  U.cmd = await user(db, "מפקד", { role: "commander", companyId: A });
});
beforeEach(async () => {
  await db.query("delete from public.app_records where app_slug = 'booking'");
  await db.query("delete from public.rate_counters");
});

const call = (u: TestUser, method: string, params: object) => executeCall({ db }, { userId: u.id, slug: "booking" }, method, params);
const book = (u: TestUser, machine: string, day: string, time: string) =>
  call(u, "data.add", { collection: "slots", data: { machine, kind: machine.startsWith("w") ? "washer" : "dryer", day, time } });

describe("unique slots", () => {
  it("a slot can be held by one person only", async () => {
    await book(U.a, "w1", "2026-11-22", "18:00");
    await expect(book(U.b, "w1", "2026-11-22", "18:00")).rejects.toMatchObject({ code: "conflict" });
    // other machine / time / day is fine
    await expect(book(U.b, "w2", "2026-11-22", "18:00")).resolves.toBeTruthy();
    await expect(book(U.b, "w1", "2026-11-22", "18:30")).resolves.toBeTruthy();
  });

  it("is atomic under concurrency (10 people tap the same slot at once → exactly 1 wins)", async () => {
    const people = await Promise.all(Array.from({ length: 10 }, (_, i) => user(db, `ח${i}`, {})));
    const results = await Promise.allSettled(people.map((p) => book(p, "d1", "2026-11-23", "07:00")));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason.code === "conflict")).toBe(true);
  });

  it("update cannot move a booking onto a taken slot, but may keep its own", async () => {
    await book(U.a, "w1", "2026-11-22", "10:00");
    const mine = (await book(U.b, "w1", "2026-11-22", "10:30")) as { id: string };
    await expect(call(U.b, "data.update", { collection: "slots", id: mine.id, patch: { time: "10:00" } })).rejects.toMatchObject({ code: "conflict" });
    await expect(call(U.b, "data.update", { collection: "slots", id: mine.id, patch: { reminderId: "x" } })).resolves.toBeTruthy();
  });

  it("requires the unique keys", async () => {
    await expect(call(U.a, "data.add", { collection: "slots", data: { kind: "washer", day: "2026-11-22" } })).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("weekly quota (Sunday–Saturday, by the booked day)", () => {
  it("2 washes + 2 dries per week, counted separately", async () => {
    // 2026-11-22 is a Sunday; 2026-11-28 Saturday
    await book(U.a, "w1", "2026-11-22", "08:00");
    await book(U.a, "w2", "2026-11-28", "08:00");
    await expect(book(U.a, "w3", "2026-11-25", "08:00")).rejects.toMatchObject({ code: "rate_limited" });
    await book(U.a, "d1", "2026-11-23", "09:00");
    await book(U.a, "d2", "2026-11-24", "09:00");
    await expect(book(U.a, "d3", "2026-11-24", "10:00")).rejects.toMatchObject({ code: "rate_limited" });
    // next week (Sunday 2026-11-29) is a new quota; previous Saturday (2026-11-21) too
    await expect(book(U.a, "w1", "2026-11-29", "08:00")).resolves.toBeTruthy();
    await expect(book(U.a, "w1", "2026-11-21", "08:00")).resolves.toBeTruthy();
    // other people are not affected
    await expect(book(U.b, "w4", "2026-11-25", "08:00")).resolves.toBeTruthy();
  });

  it("cancelling frees the quota; updates don't count the record twice", async () => {
    const r1 = (await book(U.a, "w1", "2026-11-22", "08:00")) as { id: string };
    await book(U.a, "w2", "2026-11-22", "09:00");
    await expect(call(U.a, "data.update", { collection: "slots", id: r1.id, patch: { time: "12:00" } })).resolves.toBeTruthy();
    await call(U.a, "data.remove", { collection: "slots", id: r1.id });
    await expect(book(U.a, "w3", "2026-11-22", "10:00")).resolves.toBeTruthy();
  });

  it("is exact under concurrency (5 parallel bookings → 2 succeed)", async () => {
    const r = await Promise.allSettled(["06:00", "06:30", "07:00", "07:30", "08:00"].map((t) => book(U.b, "w5", "2026-12-01", t)));
    expect(r.filter((x) => x.status === "fulfilled").length).toBe(2);
  });

  it("rejects a bad date field", async () => {
    await expect(call(U.a, "data.add", { collection: "slots", data: { machine: "w1", kind: "washer", day: "22/11/2026", time: "08:00" } })).rejects.toMatchObject({
      code: "invalid",
    });
  });
});

describe("list({ mine })", () => {
  it("returns only the caller's records", async () => {
    await book(U.a, "w1", "2026-11-22", "08:00");
    await book(U.b, "w2", "2026-11-22", "08:00");
    const mine = (await call(U.a, "data.list", { collection: "slots", options: { mine: true } })) as { mine: boolean }[];
    expect(mine.length).toBe(1);
    expect(mine.every((r) => r.mine)).toBe(true);
    const all = (await call(U.a, "data.list", { collection: "slots" })) as unknown[];
    expect(all.length).toBe(2);
  });
});

describe("capacity (a slot two people may share, or one person takes whole)", () => {
  const take = (u: TestUser, seats: unknown, time = "18:00") =>
    call(u, "data.add", { collection: "shared", data: { machine: "d1", day: "2026-11-22", time, seats } });

  it("two people sharing fill the slot; a third is rejected", async () => {
    const c = await user(db, "ג", {});
    await take(U.a, 1);
    await expect(take(U.b, 1)).resolves.toBeTruthy();
    await expect(take(c, 1)).rejects.toMatchObject({ code: "conflict" });
  });

  it("taking the whole slot blocks everyone, and can't join a half-taken slot", async () => {
    await take(U.a, 2);
    await expect(take(U.b, 1)).rejects.toMatchObject({ code: "conflict" });
    await take(U.a, 1, "19:00");
    await expect(take(U.b, 2, "19:00")).rejects.toMatchObject({ code: "conflict" });
    // other slots are separate
    await expect(take(U.b, 2, "20:00")).resolves.toBeTruthy();
  });

  it("freeing a seat lets the next person in; updates don't count the record twice", async () => {
    const r = (await take(U.a, 1)) as { id: string };
    await take(U.b, 1);
    await expect(call(U.a, "data.update", { collection: "shared", id: r.id, patch: { note: "x" } })).resolves.toBeTruthy();
    // growing to the whole slot while someone shares it is not allowed
    await expect(call(U.a, "data.update", { collection: "shared", id: r.id, patch: { seats: 2 } })).rejects.toMatchObject({ code: "conflict" });
    await call(U.a, "data.remove", { collection: "shared", id: r.id });
    const c = await user(db, "ד", {});
    await expect(take(c, 1)).resolves.toBeTruthy();
  });

  it("validates the size field", async () => {
    for (const bad of [0, 3, 1.5, "1", null, undefined]) await expect(take(U.a, bad)).rejects.toMatchObject({ code: "invalid" });
  });

  it("an old record without a size takes every seat", async () => {
    await db.query(
      `insert into public.app_records (app_slug, collection, owner_id, data) values ('booking', 'shared', $1, $2::jsonb)`,
      [U.a.id, JSON.stringify({ machine: "d1", day: "2026-11-22", time: "18:00" })],
    );
    await expect(take(U.b, 1)).rejects.toMatchObject({ code: "conflict" });
  });

  it("is atomic under concurrency (10 people share one slot at once → exactly 2 win)", async () => {
    const people = await Promise.all(Array.from({ length: 10 }, (_, i) => user(db, `ש${i}`, {})));
    const results = await Promise.allSettled(people.map((p) => take(p, 1, "07:00")));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(2);
  });

  it("without sizeField every record takes one seat", async () => {
    const c = await user(db, "ה", {});
    await call(U.a, "data.add", { collection: "pairs", data: { slot: "x" } });
    await call(U.b, "data.add", { collection: "pairs", data: { slot: "x" } });
    await expect(call(c, "data.add", { collection: "pairs", data: { slot: "x" } })).rejects.toMatchObject({ code: "conflict" });
  });
});
