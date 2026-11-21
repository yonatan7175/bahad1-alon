// Positions (תפקידים): request → admin approves → the holder manages the position's apps,
// exactly like an app manager; pending / rejected / removed holders get nothing.
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/generated/registry", () => import("../support/registry-fixture"));
import { executeCall } from "@/platform/server/engine";
import type { Db } from "@/platform/server/db-core";
import * as P from "@/platform/server/positions";
import { company, platoon, rawRecord, testDb, user, type TestUser } from "../support/db";

let db: Db;
let admin: TestUser;
let owner: TestUser;
let cand: TestUser;
let pos: string;
let rec: string;

beforeAll(async () => {
  db = await testDb();
  const A = await company(db, "A");
  admin = await user(db, "admin", { role: "admin" });
  owner = await user(db, "owner", { companyId: A, platoonId: await platoon(db, A, "1") });
  cand = await user(db, "cand", { companyId: A });
  pos = await P.createPosition(db, admin.id, "  מנהל   מטריצה ", "בדיקה");
  await P.updatePosition(db, admin.id, pos, "מנהל מטריצה", "בדיקה", ["app:matrix"]);
  rec = await rawRecord(db, "matrix", "ro_ma_cy", owner.id, { v: 1 });
});

const call = (u: TestUser, method: string, params: object = {}) => executeCall({ db }, { userId: u.id, slug: "matrix" }, method, params);
const sees = async (u: TestUser) => ((await call(u, "data.list", { collection: "ro_ma_cy" })) as { id: string }[]).some((r) => r.id === rec);
const mine = async (u: TestUser) => (await P.myPositions(db, u.id)).find((p) => p.id === pos)!;

describe("positions", () => {
  it("ships with קא\"ר, קל\"פ and קל\"ג; the logistics ones manage dorm + laundry", async () => {
    const fresh = await testDb();
    const list = await P.listPositions(fresh);
    expect(list.map((p) => p.name)).toEqual(['קא"ר', 'קל"פ', 'קל"ג']);
    expect(list.find((p) => p.name === 'קל"ג')!.apps).toEqual(["app:dorm", "app:laundry"]);
    expect(list.map((p) => p.scope)).toEqual(["company", "company", "battalion"]); // קא"ר, קל"פ פלוגתי; קל"ג גדודי
    await fresh.close();
  });

  it("names are trimmed and unique", async () => {
    expect((await P.listPositions(db)).find((p) => p.id === pos)!.name).toBe("מנהל מטריצה");
    await expect(P.createPosition(db, admin.id, "מנהל מטריצה", "")).rejects.toBeInstanceOf(P.PositionError);
    await expect(P.updatePosition(db, admin.id, pos, "x", "", ["app:Bad Slug"])).rejects.toBeInstanceOf(P.PositionError);
  });

  it("a pending request gives nothing; approval makes the holder an app manager", async () => {
    expect(await P.requestPosition(db, cand.id, pos, "אני הקל\"ג")).toBe("requested");
    expect(await P.requestPosition(db, cand.id, pos)).toBe("unchanged"); // asking twice changes nothing
    expect(await mine(cand)).toMatchObject({ status: "pending", reason: 'אני הקל"ג' });
    expect(await P.pendingPositionCount(db)).toBe(1);
    expect(await sees(cand)).toBe(false);
    await expect(call(cand, "user.me")).resolves.toMatchObject({ manager: false });

    expect(await P.decidePosition(db, admin.id, pos, cand.id, "approve")).toBe(true);
    expect(await P.decidePosition(db, admin.id, pos, cand.id, "approve")).toBe(false); // not pending any more
    expect(await sees(cand)).toBe(true);
    await expect(call(cand, "data.update", { collection: "ro_ma_cy", id: rec, patch: { v: 2 } })).resolves.toBeTruthy();
    await expect(call(cand, "user.me")).resolves.toMatchObject({ manager: true });
    expect(await P.heldPositionNames(db, cand.id)).toEqual(["מנהל מטריצה"]);
    expect(await P.pendingPositionCount(db)).toBe(0);
  });

  it("only manages the position's apps", async () => {
    await expect(P.appManagement(db, cand.id, "other")).resolves.toEqual({ all: false, companies: [] });
    await expect(P.appManagement(db, cand.id, "matrix")).resolves.toEqual({ all: true, companies: [] });
  });

  it("giving the position up (or an admin removing it) ends the powers", async () => {
    await P.leavePosition(db, cand.id, pos);
    expect((await mine(cand)).status).toBeNull();
    expect(await sees(cand)).toBe(false);
    await P.assignPosition(db, admin.id, pos, cand.id);
    expect(await sees(cand)).toBe(true);
    await P.removeHolder(db, admin.id, pos, cand.id);
    expect(await sees(cand)).toBe(false);
  });

  it("a rejected request shows the note and can be asked again", async () => {
    await P.requestPosition(db, cand.id, pos);
    await P.decidePosition(db, admin.id, pos, cand.id, "reject", "לא בתפקיד");
    expect(await mine(cand)).toMatchObject({ status: "rejected", reviewNote: "לא בתפקיד" });
    expect(await sees(cand)).toBe(false);
    expect(await P.requestPosition(db, cand.id, pos)).toBe("requested");
    expect(await mine(cand)).toMatchObject({ status: "pending", reviewNote: null });
  });

  it("several positions at once; deleting a position removes its holders", async () => {
    const second = await P.createPosition(db, admin.id, "תפקיד שני", "");
    await P.assignPosition(db, admin.id, second, cand.id);
    await P.decidePosition(db, admin.id, pos, cand.id, "approve");
    expect(await P.heldPositionNames(db, cand.id)).toHaveLength(2);
    await P.deletePosition(db, admin.id, pos);
    expect(await P.heldPositionNames(db, cand.id)).toEqual(["תפקיד שני"]);
    expect(await sees(cand)).toBe(false);
  });

  it("can not assign to unapproved users or unknown positions", async () => {
    const pending = await user(db, "pending", { status: "pending" });
    const second = (await P.listPositions(db)).find((p) => p.name === "תפקיד שני")!.id;
    await expect(P.assignPosition(db, admin.id, second, pending.id)).rejects.toBeInstanceOf(P.PositionError);
    await expect(P.requestPosition(db, cand.id, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(P.PositionError);
    await expect(P.requestPosition(db, cand.id, "nope")).rejects.toBeInstanceOf(P.PositionError);
  });

  it("every change is in the audit log", async () => {
    const { rows } = await db.query<{ action: string }>("select distinct action from public.audit_log where action like 'position.%'");
    expect(rows.map((r) => r.action).sort()).toEqual(
      ["position.approve", "position.assign", "position.create", "position.delete", "position.leave", "position.reject", "position.remove", "position.request", "position.update"].sort(),
    );
  });
});

describe("פלוגתי positions", () => {
  let d: Db;
  let adm: TestUser;
  let A: string;
  let B: string;
  let klp: TestUser; // קל"פ of A
  let ownerA: TestUser;
  let ownerB: TestUser;
  let noCompany: TestUser;
  let pid: string;
  const recs: Record<string, string> = {};
  const c = (u: TestUser, method: string, params: object = {}) => executeCall({ db: d }, { userId: u.id, slug: "matrix" }, method, params);
  const listed = async (u: TestUser, coll = "ro_ma_cy") => ((await c(u, "data.list", { collection: coll })) as { id: string }[]).map((r) => r.id);

  beforeAll(async () => {
    d = await testDb();
    adm = await user(d, "adm", { role: "admin" });
    A = await company(d, "פלוגה ט'");
    B = await company(d, "פלוגה י'");
    klp = await user(d, "klp", { companyId: A });
    ownerA = await user(d, "ownerA", { companyId: A });
    ownerB = await user(d, "ownerB", { companyId: B });
    noCompany = await user(d, "noCompany");
    pid = await P.createPosition(d, adm.id, "מנהל פלוגתי", "", "company");
    await P.updatePosition(d, adm.id, pid, "מנהל פלוגתי", "", ["app:matrix"], "company");
    for (const [k, o] of [["a", ownerA], ["b", ownerB]] as const) {
      recs[k] = await rawRecord(d, "matrix", "ro_ma_cy", o.id, { v: 1 });
      recs[`${k}none`] = await rawRecord(d, "matrix", "ro_mn_cy", o.id, { v: 1 });
    }
  });

  it("the request is tied to the requester's company and shown with it", async () => {
    await P.requestPosition(d, klp.id, pid);
    expect((await P.myPositions(d, klp.id)).find((p) => p.id === pid)).toMatchObject({ status: "pending", companyName: "פלוגה ט'" });
    await P.decidePosition(d, adm.id, pid, klp.id, "approve");
    expect(await P.heldPositionNames(d, klp.id)).toEqual(["מנהל פלוגתי · פלוגה ט'"]);
    const { getPerson } = await import("@/platform/server/directory");
    expect((await getPerson(d, klp.id))!.positions).toEqual(["מנהל פלוגתי · פלוגה ט'"]);
  });

  it("manages only records of people in that company (list, get, update, remove)", async () => {
    await expect(P.appManagement(d, klp.id, "matrix")).resolves.toEqual({ all: false, companies: [A] });
    const ids = await listed(klp);
    expect(ids).toContain(recs.a);
    expect(ids).not.toContain(recs.b);
    await expect(c(klp, "data.get", { collection: "ro_ma_cy", id: recs.a })).resolves.toBeTruthy();
    await expect(c(klp, "data.get", { collection: "ro_ma_cy", id: recs.b })).rejects.toMatchObject({ code: "not_found" });
    await expect(c(klp, "data.update", { collection: "ro_ma_cy", id: recs.a, patch: { v: 2 } })).resolves.toBeTruthy();
    await expect(c(klp, "data.update", { collection: "ro_ma_cy", id: recs.b, patch: { v: 2 } })).rejects.toMatchObject({ code: "not_found" });
    await expect(c(klp, "data.remove", { collection: "ro_ma_cy", id: recs.b })).rejects.toMatchObject({ code: "not_found" });
    await expect(c(klp, "user.me")).resolves.toMatchObject({ manager: true });
  });

  it("gets nothing where moderate is none", async () => {
    expect(await listed(klp, "ro_mn_cy")).not.toContain(recs.anone);
  });

  it("can not be asked or given without a company", async () => {
    await expect(P.requestPosition(d, noCompany.id, pid)).rejects.toThrow(/פלוגה/);
    await expect(P.assignPosition(d, adm.id, pid, noCompany.id)).rejects.toThrow(/פלוגה/);
  });

  it("the holding keeps its company when the person moves company", async () => {
    await d.query("update public.profiles set company_id = $2 where id = $1", [klp.id, B]);
    await expect(P.appManagement(d, klp.id, "matrix")).resolves.toEqual({ all: false, companies: [A] });
    await d.query("update public.profiles set company_id = $2 where id = $1", [klp.id, A]);
  });

  it("switching the position to גדודי gives the whole app; back to פלוגתי re-attaches the current company", async () => {
    await P.updatePosition(d, adm.id, pid, "מנהל פלוגתי", "", ["app:matrix"], "battalion");
    await expect(P.appManagement(d, klp.id, "matrix")).resolves.toEqual({ all: true, companies: [] });
    expect(await listed(klp)).toEqual(expect.arrayContaining([recs.a, recs.b]));
    expect(await P.heldPositionNames(d, klp.id)).toEqual(["מנהל פלוגתי"]);
    await P.updatePosition(d, adm.id, pid, "מנהל פלוגתי", "", ["app:matrix"], "company");
    await expect(P.appManagement(d, klp.id, "matrix")).resolves.toEqual({ all: false, companies: [A] });
    await expect(P.updatePosition(d, adm.id, pid, "מנהל פלוגתי", "", [], "nope")).rejects.toBeInstanceOf(P.PositionError);
  });
});

describe("positions in the directory", () => {
  it("everyone sees approved positions next to the name; pending ones stay private", async () => {
    const { listPeople, getPerson } = await import("@/platform/server/directory");
    const d = await testDb();
    const a = await user(d, "a", { role: "admin" });
    const x = await user(d, "x", { companyId: await company(d, "פלוגה כ'") });
    const id = new Map((await P.listPositions(d)).map((p) => [p.name, p.id]));
    await P.assignPosition(d, a.id, id.get('קל"ג')!, x.id);
    await P.assignPosition(d, a.id, id.get('קא"ר')!, x.id);
    await P.requestPosition(d, x.id, id.get('קל"פ')!); // pending: not shown
    expect((await getPerson(d, x.id))!.positions).toEqual(['קא"ר · פלוגה כ\'', 'קל"ג']); // in the list's order; פלוגתי with the company
    expect((await listPeople(d)).find((p) => p.id === a.id)!.positions).toEqual([]);
    await d.close();
  });
});
