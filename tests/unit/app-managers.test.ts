// App managers (public.app_managers): a manager of an app moderates that app's
// collections battalion-wide (like an admin), except "moderate: none" — and nothing else.
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/generated/registry", () => import("../support/registry-fixture"));
import { executeCall } from "@/platform/server/engine";
import type { Db } from "@/platform/server/db-core";
import { company, platoon, rawRecord, testDb, user, type TestUser } from "../support/db";

let db: Db;
let owner: TestUser;
let mgr: TestUser;
let otherMgr: TestUser;
const rec: Record<string, string> = {};

beforeAll(async () => {
  db = await testDb();
  const A = await company(db, "A");
  const B = await company(db, "B");
  owner = await user(db, "owner", { companyId: A, platoonId: await platoon(db, A, "1") });
  mgr = await user(db, "mgr", { companyId: B });
  otherMgr = await user(db, "otherMgr", { companyId: B });
  await db.query("insert into public.app_managers (app_slug, profile_id) values ('matrix', $1), ('other', $2)", [mgr.id, otherMgr.id]);
  await db.query("update public.profiles set room = '241' where id = $1", [mgr.id]);
  for (const c of ["ro_ma_cy", "ro_mc_cy", "ro_mn_cy"]) rec[c] = await rawRecord(db, "matrix", c, owner.id, { v: 1 });
});

const call = (u: TestUser, method: string, params: object = {}) => executeCall({ db }, { userId: u.id, slug: "matrix" }, method, params);
const ids = async (u: TestUser, collection: string) => ((await call(u, "data.list", { collection })) as { id: string }[]).map((r) => r.id);

describe("app managers", () => {
  it("read and moderate every record of their app (moderate admin/commander)", async () => {
    for (const c of ["ro_ma_cy", "ro_mc_cy"]) {
      expect(await ids(mgr, c)).toContain(rec[c]);
      await expect(call(mgr, "data.update", { collection: c, id: rec[c], patch: { v: 2 } })).resolves.toBeTruthy();
    }
  });

  it("get nothing extra where moderate is none", async () => {
    expect(await ids(mgr, "ro_mn_cy")).not.toContain(rec.ro_mn_cy);
    await expect(call(mgr, "data.update", { collection: "ro_mn_cy", id: rec.ro_mn_cy, patch: { v: 2 } })).rejects.toMatchObject({ code: "not_found" });
  });

  it("are managers of their own app only", async () => {
    expect(await ids(otherMgr, "ro_ma_cy")).not.toContain(rec.ro_ma_cy);
    await expect(call(otherMgr, "data.remove", { collection: "ro_ma_cy", id: rec.ro_ma_cy })).rejects.toMatchObject({ code: "not_found" });
  });

  it("can not create where create is admin", async () => {
    await expect(call(mgr, "data.add", { collection: "ro_ma_ca", data: {} })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("user.me() reports manager (scope role) and room (scope unit)", async () => {
    await expect(call(mgr, "user.me")).resolves.toMatchObject({ manager: true, room: "241" });
    await expect(call(owner, "user.me")).resolves.toMatchObject({ manager: false, room: null });
  });
});
