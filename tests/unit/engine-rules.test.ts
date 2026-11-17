// Automated tests for EVERY collection rule combination (Phase 2 "done when").
// read × moderate × create = 36 collections, 8 users with different roles/units.
// The expected results below are written from the plan's text (section 04),
// independently of src/platform/server/rules.ts.
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/generated/registry", () => import("../support/registry-fixture"));
import { MATRIX } from "../support/registry-fixture";
import { executeCall } from "@/platform/server/engine";
import type { Db } from "@/platform/server/db-core";
import { company, platoon, rawRecord, testDb, user, type TestUser } from "../support/db";

let db: Db;
const U: Record<string, TestUser> = {};
// records[collection][ownerKey] = record id
const records: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  db = await testDb();
  const A = await company(db, "A");
  const B = await company(db, "B");
  const A1 = await platoon(db, A, "1");
  const A2 = await platoon(db, A, "2");
  const B1 = await platoon(db, B, "1");
  U.cadetA1 = await user(db, "cadetA1", { companyId: A, platoonId: A1 });
  U.cadetA1b = await user(db, "cadetA1b", { companyId: A, platoonId: A1 });
  U.cadetA2 = await user(db, "cadetA2", { companyId: A, platoonId: A2 });
  U.cadetB1 = await user(db, "cadetB1", { companyId: B, platoonId: B1 });
  U.cmdA = await user(db, "cmdA", { role: "commander", companyId: A });
  U.cmdB = await user(db, "cmdB", { role: "commander", companyId: B, platoonId: B1 });
  U.admin = await user(db, "admin", { role: "admin" });
  U.noUnit = await user(db, "noUnit", {});
  for (const c of MATRIX) {
    records[c.name] = {};
    for (const [k, u] of Object.entries(U)) records[c.name][k] = await rawRecord(db, "matrix", c.name, u.id, { owner: k });
  }
});

const deps = () => ({ db });
const call = (u: TestUser, method: string, params: object) => executeCall(deps(), { userId: u.id, slug: "matrix" }, method, params);

function same(a: string | null, b: string | null) {
  return a !== null && b !== null && a === b;
}
function expectedModerates(actor: TestUser, moderate: string, owner: TestUser) {
  if (moderate === "admin") return actor.role === "admin";
  if (moderate === "commander") {
    if (actor.role === "admin") return true;
    return actor.role === "commander" && same(actor.companyId, owner.companyId);
  }
  return false;
}
function expectedRead(actor: TestUser, read: string, moderate: string, owner: TestUser) {
  if (actor.id === owner.id) return true;
  if (expectedModerates(actor, moderate, owner)) return true;
  if (read === "all") return true;
  if (read === "company") return same(actor.companyId, owner.companyId);
  if (read === "platoon") return same(actor.platoonId, owner.platoonId);
  return false;
}
function expectedWrite(actor: TestUser, moderate: string, owner: TestUser) {
  return actor.id === owner.id || expectedModerates(actor, moderate, owner);
}
function expectedCreate(actor: TestUser, create: string) {
  if (create === "any") return true;
  if (create === "commander") return actor.role === "commander" || actor.role === "admin";
  return actor.role === "admin";
}

describe("collection rule matrix", () => {
  it("list() returns exactly the records the rules allow", async () => {
    let checked = 0;
    for (const c of MATRIX) {
      for (const [ak, actor] of Object.entries(U)) {
        const list = (await call(actor, "data.list", { collection: c.name, options: { limit: 200 } })) as { data: { owner: string }; mine: boolean }[];
        const got = list.map((r) => r.data.owner).sort();
        const want = Object.entries(U)
          .filter(([, owner]) => expectedRead(actor, c.read, c.moderate, owner))
          .map(([k]) => k)
          .sort();
        expect(got, `${c.name} as ${ak}`).toEqual(want);
        for (const r of list) expect(r.mine).toBe(r.data.owner === ak);
        checked++;
      }
    }
    expect(checked).toBe(36 * 8);
  });

  it("get() returns visible records and not_found for invisible ones", async () => {
    for (const c of MATRIX) {
      for (const [ak, actor] of Object.entries(U)) {
        for (const [ok, owner] of Object.entries(U)) {
          const id = records[c.name][ok];
          const p = call(actor, "data.get", { collection: c.name, id });
          if (expectedRead(actor, c.read, c.moderate, owner)) await expect(p, `${c.name} ${ak}→${ok}`).resolves.toMatchObject({ id });
          else await expect(p, `${c.name} ${ak}→${ok}`).rejects.toMatchObject({ code: "not_found" });
        }
      }
    }
  });

  it("update() allowed only for own records and moderators; others get forbidden/not_found", async () => {
    for (const c of MATRIX) {
      for (const [ak, actor] of Object.entries(U)) {
        for (const [ok, owner] of Object.entries(U)) {
          const id = records[c.name][ok];
          const p = call(actor, "data.update", { collection: c.name, id, patch: { touchedBy: ak } });
          if (expectedWrite(actor, c.moderate, owner)) {
            await expect(p, `${c.name} ${ak}→${ok}`).resolves.toMatchObject({ id, data: { owner: ok, touchedBy: ak } });
          } else if (expectedRead(actor, c.read, c.moderate, owner)) {
            await expect(p, `${c.name} ${ak}→${ok}`).rejects.toMatchObject({ code: "forbidden" });
          } else {
            await expect(p, `${c.name} ${ak}→${ok}`).rejects.toMatchObject({ code: "not_found" });
          }
        }
        // the rate limit (60 writes/min/user/app) would trip in this loop; reset between actors
        await db.query("delete from public.rate_counters");
      }
    }
  });

  it("add() follows the create rule", async () => {
    for (const c of MATRIX) {
      for (const [ak, actor] of Object.entries(U)) {
        const p = call(actor, "data.add", { collection: c.name, data: { added: ak } });
        if (expectedCreate(actor, c.create)) await expect(p, `${c.name} ${ak}`).resolves.toMatchObject({ mine: true, data: { added: ak } });
        else await expect(p, `${c.name} ${ak}`).rejects.toMatchObject({ code: "forbidden" });
      }
      await db.query("delete from public.rate_counters");
    }
  });

  it("remove() allowed only for own records and moderators", async () => {
    for (const c of MATRIX) {
      for (const [ak, actor] of Object.entries(U)) {
        for (const [ok, owner] of Object.entries(U)) {
          // fresh record per pair so deletes don't affect later pairs
          const id = await rawRecord(db, "matrix", c.name, owner.id, { tmp: true });
          const p = call(actor, "data.remove", { collection: c.name, id });
          if (expectedWrite(actor, c.moderate, owner)) {
            await expect(p, `${c.name} ${ak}→${ok}`).resolves.toBeNull();
            const { rows } = await db.query("select 1 from public.app_records where id = $1", [id]);
            expect(rows.length).toBe(0);
          } else {
            await expect(p, `${c.name} ${ak}→${ok}`).rejects.toMatchObject({
              code: expectedRead(actor, c.read, c.moderate, owner) ? "forbidden" : "not_found",
            });
            await db.query("delete from public.app_records where id = $1", [id]);
          }
        }
        await db.query("delete from public.rate_counters");
      }
    }
  });

  it("a record's visibility follows the owner's CURRENT unit", async () => {
    const c = "rp_mn_cy"; // read: platoon
    const id = await rawRecord(db, "matrix", c, U.cadetA2.id, { moving: true });
    await expect(call(U.cadetA1, "data.get", { collection: c, id })).rejects.toMatchObject({ code: "not_found" });
    const { rows } = await db.query<{ platoon_id: string }>("select platoon_id from public.profiles where id = $1", [U.cadetA1.id]);
    await db.query("update public.profiles set platoon_id = $2 where id = $1", [U.cadetA2.id, rows[0].platoon_id]);
    await expect(call(U.cadetA1, "data.get", { collection: c, id })).resolves.toMatchObject({ id });
    await db.query("update public.profiles set platoon_id = $2 where id = $1", [U.cadetA2.id, U.cadetA2.platoonId]);
  });
});
