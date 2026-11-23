// Username + password sign-in: registration creates a pending profile, login checks the scrypt hash,
// wrong passwords lock the username for a while, blocked users can't sign in.
import { beforeAll, describe, expect, it } from "vitest";
import {
  changePassword,
  hashPassword,
  loginPasswordUser,
  MAX_FAILED,
  normalizeUsername,
  passwordProblem,
  registerPasswordUser,
  usernameOf,
  verifyPassword,
} from "@/platform/auth/password";
import type { Db } from "@/platform/server/db-core";
import { testDb } from "../support/db";

let db: Db;
beforeAll(async () => {
  db = await testDb();
});

describe("password helpers", () => {
  it("normalizes usernames and checks passwords", () => {
    expect(normalizeUsername("  Yossi.K ")).toBe("yossi.k");
    expect(normalizeUsername("ab")).toBeNull();
    expect(normalizeUsername("יוסי")).toBeNull();
    expect(normalizeUsername("-yossi")).toBeNull();
    expect(passwordProblem("short1")).not.toBeNull();
    expect(passwordProblem("onlyletters")).not.toBeNull();
    expect(passwordProblem("12345678")).not.toBeNull();
    expect(passwordProblem("good pass 1")).toBeNull();
  });

  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("secret123");
    const b = await hashPassword("secret123");
    expect(a).not.toBe(b);
    expect(a).not.toContain("secret123");
    expect(await verifyPassword("secret123", a)).toBe(true);
    expect(await verifyPassword("secret124", a)).toBe(false);
    expect(await verifyPassword("secret123", "garbage")).toBe(false);
  });
});

describe("register / login", () => {
  it("registers a pending, not-yet-onboarded profile without an email", async () => {
    const r = await registerPasswordUser(db, "Dana_1", "dana pass 1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { rows } = await db.query<{ status: string; onboarded_at: Date | null; email: string }>(
      "select status, onboarded_at, email from public.profiles where id = $1",
      [r.userId],
    );
    expect(rows[0]).toMatchObject({ status: "pending", onboarded_at: null, email: "" });
    expect(await usernameOf(db, r.userId)).toBe("dana_1");
    const dup = await registerPasswordUser(db, "DANA_1", "other pass 2");
    expect(dup.ok).toBe(false);
  });

  it("signs in with the right password only (username is case-insensitive)", async () => {
    const r = await registerPasswordUser(db, "moshe", "moshe pass 1");
    if (!r.ok) throw new Error(r.error);
    expect(await loginPasswordUser(db, "MOSHE", "moshe pass 1")).toEqual({ ok: true, userId: r.userId });
    expect((await loginPasswordUser(db, "moshe", "wrong pass 1")).ok).toBe(false);
    expect((await loginPasswordUser(db, "nobody", "moshe pass 1")).ok).toBe(false);
  });

  it("locks the username after too many wrong passwords", async () => {
    const r = await registerPasswordUser(db, "locked", "locked pass 1");
    if (!r.ok) throw new Error(r.error);
    for (let i = 0; i < MAX_FAILED; i++) await loginPasswordUser(db, "locked", "nope nope 1");
    const res = await loginPasswordUser(db, "locked", "locked pass 1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/יותר מדי/);
    await db.query("update public.password_logins set locked_until = now() - interval '1 minute' where user_id = $1", [r.userId]);
    expect((await loginPasswordUser(db, "locked", "locked pass 1")).ok).toBe(true);
  });

  it("refuses blocked users and changes passwords", async () => {
    const r = await registerPasswordUser(db, "rina", "rina pass 1");
    if (!r.ok) throw new Error(r.error);
    expect(await changePassword(db, r.userId, "wrong pass 1", "new pass 22")).not.toBeNull();
    expect(await changePassword(db, r.userId, "rina pass 1", "new pass 22")).toBeNull();
    expect((await loginPasswordUser(db, "rina", "rina pass 1")).ok).toBe(false);
    expect((await loginPasswordUser(db, "rina", "new pass 22")).ok).toBe(true);
    await db.query("update auth.users set banned_until = 'infinity' where id = $1", [r.userId]);
    expect((await loginPasswordUser(db, "rina", "new pass 22")).ok).toBe(false);
  });

  it("is removed with the identity", async () => {
    const r = await registerPasswordUser(db, "gone", "gone pass 1");
    if (!r.ok) throw new Error(r.error);
    await db.query("delete from auth.users where id = $1", [r.userId]);
    expect(await usernameOf(db, r.userId)).toBeNull();
  });
});
