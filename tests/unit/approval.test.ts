// Account approval: after registering, a new user waits ("מחכה לאישור מנהל") until an admin approves.
// BAHAD_REQUIRE_APPROVAL=0 turns it off (open registration: the user is approved on next sign-in).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/generated/registry", () => import("../support/registry-fixture"));

const state = vi.hoisted(() => ({ db: null as unknown, authId: null as string | null }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(f: T) => f }));
vi.mock("@/platform/server/db", () => ({ getDb: async () => state.db }));
vi.mock("@/platform/auth/index", () => ({
  getAuthUser: async () => (state.authId ? { id: state.authId, email: "x@example.com", name: "x", avatarUrl: null } : null),
}));

import { executeCall } from "@/platform/server/engine";
import { getSession } from "@/platform/auth/session";
import { requireApproval } from "@/platform/server/config";
import { STATUS_LABEL } from "@/lib/site";
import type { Db } from "@/platform/server/db-core";
import { testDb, user } from "../support/db";

let db: Db;
beforeAll(async () => {
  db = await testDb();
  state.db = db;
});
afterEach(() => {
  vi.unstubAllEnvs();
  state.authId = null;
});

async function registered(name: string) {
  const u = await user(db, name, { status: "pending" });
  await db.query("update public.profiles set onboarded_at = now() where id = $1", [u.id]);
  return u;
}
const status = async (id: string) =>
  (await db.query<{ status: string }>("select status from public.profiles where id = $1", [id])).rows[0].status;

describe("account approval", () => {
  it("is on by default; only BAHAD_REQUIRE_APPROVAL=0 turns it off", () => {
    vi.stubEnv("BAHAD_REQUIRE_APPROVAL", "");
    expect(requireApproval()).toBe(true);
    vi.stubEnv("BAHAD_REQUIRE_APPROVAL", "1");
    expect(requireApproval()).toBe(true);
    vi.stubEnv("BAHAD_REQUIRE_APPROVAL", "0");
    expect(requireApproval()).toBe(false);
  });

  it("shows the waiting state as מחכה לאישור מנהל", () => {
    expect(STATUS_LABEL.pending).toBe("מחכה לאישור מנהל");
  });

  it("a registered user stays pending on sign-in while approval is required", async () => {
    const u = await registered("ממתינה");
    state.authId = u.id;
    const s = await getSession();
    expect(s?.profile.status).toBe("pending");
    expect(await status(u.id)).toBe("pending");
  });

  it("a pending user can't use any app until approved", async () => {
    const u = await registered("ממתין");
    await expect(executeCall({ db }, { userId: u.id, slug: "matrix" }, "user.me", {})).rejects.toMatchObject({ code: "forbidden" });
    await db.query("update public.profiles set status = 'approved', approved_at = now() where id = $1", [u.id]);
    await expect(executeCall({ db }, { userId: u.id, slug: "matrix" }, "user.me", {})).resolves.toBeTruthy();
  });

  it("with approval off, a registered pending user is approved on sign-in (and audited)", async () => {
    vi.stubEnv("BAHAD_REQUIRE_APPROVAL", "0");
    const u = await registered("פתוח");
    state.authId = u.id;
    expect((await getSession())?.profile.status).toBe("approved");
    const { rows } = await db.query("select 1 from public.audit_log where action = 'user.auto_approve' and target = $1", [u.id]);
    expect(rows.length).toBe(1);
  });

  it("a user who hasn't finished registering is never auto-approved", async () => {
    vi.stubEnv("BAHAD_REQUIRE_APPROVAL", "0");
    const u = await user(db, "חצי", { status: "pending" });
    state.authId = u.id;
    expect((await getSession())?.profile.status).toBe("pending");
  });

  it("blocked users stay blocked either way", async () => {
    vi.stubEnv("BAHAD_REQUIRE_APPROVAL", "0");
    const u = await user(db, "חסום", { status: "blocked" });
    state.authId = u.id;
    expect((await getSession())?.profile.status).toBe("blocked");
  });
});
