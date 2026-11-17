import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/generated/registry", () => import("../support/registry-fixture"));
import { executeCall, israelToday } from "@/platform/server/engine";
import type { Db } from "@/platform/server/db-core";
import { company, platoon, testDb, user, type TestUser } from "../support/db";

let db: Db;
const U: Record<string, TestUser> = {};
beforeAll(async () => {
  db = await testDb();
  const A = await company(db, "פלוגה א");
  const A1 = await platoon(db, A, "מחלקה 1");
  U.a = await user(db, "ישראל", { companyId: A, platoonId: A1, phone: "050-1111111" });
  U.b = await user(db, "נועה", { companyId: A, platoonId: A1, phone: "050-2222222" });
  U.p = await user(db, "ממתין", { status: "pending" });
});
const call = (u: TestUser, slug: string, method: string, params: object) => executeCall({ db }, { userId: u.id, slug }, method, params);
const plus = (n: number) => new Date(Date.parse(israelToday() + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

describe("collection date window", () => {
  it("allows today … today+28 (Israel time), rejects past and further ahead", async () => {
    for (const n of [0, 1, 28]) await expect(call(U.a, "booking", "data.add", { collection: "windowed", data: { day: plus(n) } }), `+${n}`).resolves.toBeTruthy();
    for (const n of [-1, 29, 365]) await expect(call(U.a, "booking", "data.add", { collection: "windowed", data: { day: plus(n) } }), `+${n}`).rejects.toMatchObject({ code: "invalid" });
    await expect(call(U.a, "booking", "data.add", { collection: "windowed", data: { day: "soon" } })).rejects.toMatchObject({ code: "invalid" });
  });
  it("applies to updates too", async () => {
    const r = (await call(U.a, "booking", "data.add", { collection: "windowed", data: { day: plus(2) } })) as { id: string };
    await expect(call(U.a, "booking", "data.update", { collection: "windowed", id: r.id, patch: { day: plus(40) } })).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("people.get (scope directory)", () => {
  it("returns a directory card that respects the person's privacy switches", async () => {
    const card = await call(U.a, "dir-app", "people.get", { id: U.b.id });
    expect(card).toMatchObject({ id: U.b.id, name: "נועה", company: "פלוגה א", platoon: "מחלקה 1", phone: "050-2222222" });
    await db.query("update public.profiles set show_phone = false, show_email = false where id = $1", [U.b.id]);
    expect(await call(U.a, "dir-app", "people.get", { id: U.b.id })).toMatchObject({ phone: null, email: null });
  });
  it("needs the directory scope; unknown or unapproved users are not_found", async () => {
    await expect(call(U.a, "other", "people.get", { id: U.b.id })).rejects.toMatchObject({ code: "forbidden" });
    await expect(call(U.a, "dir-app", "people.get", { id: U.p.id })).rejects.toMatchObject({ code: "not_found" });
    await expect(call(U.a, "dir-app", "people.get", { id: "nope" })).rejects.toMatchObject({ code: "not_found" });
  });
});
