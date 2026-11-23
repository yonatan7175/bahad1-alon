// "התחברות עם צ1": outside websites sign users in with the portal (OAuth code + PKCE) and get a
// read-only token: the user, plus the directory only when the קב״מית allowed it.
import { beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  cleanRedirect,
  directory,
  disconnectSite,
  exchangeCode,
  grantConsent,
  hasConsent,
  isKabam,
  issueCode,
  redirectMatches,
  userInfo,
  validateAuthorize,
  verifyToken,
} from "@/platform/auth/connect";
import type { Db } from "@/platform/server/db-core";
import { company, platoon, testDb, user, type TestUser } from "../support/db";

let db: Db;
let me: TestUser;
let other: TestUser;
beforeAll(async () => {
  db = await testDb();
  const c = await company(db, "פלוגת בדיקה");
  const pl = await platoon(db, c, "צוות 3");
  me = await user(db, "ישראל ישראלי", { companyId: c, platoonId: pl, phone: "050-1234567" });
  other = await user(db, "נועה כהן", { companyId: c, phone: "052-1111111" });
  await db.query("update public.profiles set show_phone = false where id = $1", [other.id]);
});

const b64 = (b: Buffer) => b.toString("base64url");
function pkce() {
  const verifier = b64(randomBytes(48));
  return { verifier, challenge: b64(createHash("sha256").update(verifier).digest()) };
}
async function site(url: string, opts: { status?: string; kabam?: string | null; directory?: boolean; submittedBy?: string } = {}) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.app_submissions (kind, name, url, status, kabam_status, connect, want_directory, directory_allowed, submitted_by)
     values ('url', 'אתר בדיקה', $1, $2, $3, true, $4, $4, $5) returning id`,
    [url, opts.status ?? "approved", opts.kabam === undefined ? "approved" : opts.kabam, opts.directory ?? false, opts.submittedBy ?? null],
  );
  return rows[0].id;
}
async function signInFlow(redirectUri: string, userId: string) {
  const { verifier, challenge } = pkce();
  const req = await validateAuthorize(db, { redirect_uri: redirectUri, state: "s1", code_challenge: challenge, code_challenge_method: "S256" }, userId);
  const url = new URL(await issueCode(db, req, userId));
  expect(url.searchParams.get("state")).toBe("s1");
  const code = url.searchParams.get("code")!;
  return { code, verifier, req };
}

describe("redirect URIs", () => {
  it("must be https on the site's origin, under its path", () => {
    expect(cleanRedirect("http://x.com/")).toBeNull();
    expect(cleanRedirect("https://x.com/a?b=1#c")?.href).toBe("https://x.com/a");
    expect(redirectMatches("https://u.github.io/app/", "https://u.github.io/app/")).toBe(true);
    expect(redirectMatches("https://u.github.io/app/", "https://u.github.io/app/page")).toBe(true);
    expect(redirectMatches("https://u.github.io/app/", "https://u.github.io/app")).toBe(true);
    expect(redirectMatches("https://u.github.io/app/", "https://u.github.io/other/")).toBe(false);
    expect(redirectMatches("https://u.github.io/app", "https://u.github.io/application")).toBe(false);
    expect(redirectMatches("https://x.com/", "https://x.com.evil.com/")).toBe(false);
  });
});

describe("sign-in flow", () => {
  it("code + PKCE → token → the user (no directory unless allowed)", async () => {
    await site("https://fit.example.com/");
    const { code, verifier } = await signInFlow("https://fit.example.com/", me.id);
    const { token } = await exchangeCode(db, code, verifier, "https://fit.example.com/", "https://fit.example.com");
    expect(token.scope).toBe("profile");
    const t = await verifyToken(db, `Bearer ${token.access_token}`);
    const u = await userInfo(db, t);
    expect(u).toMatchObject({ id: me.id, name: "ישראל ישראלי", company: "פלוגת בדיקה", platoon: "צוות 3", phone: "050-1234567", scopes: ["profile"] });
    await expect(directory(db, t)).rejects.toThrow(/קב״מית/);
  });

  it("the directory, when the קב״מית allowed it — hidden phones stay hidden", async () => {
    await site("https://people.example.com/app/", { directory: true });
    const { code, verifier } = await signInFlow("https://people.example.com/app/", me.id);
    const { token } = await exchangeCode(db, code, verifier, "https://people.example.com/app/");
    const people = await directory(db, await verifyToken(db, `Bearer ${token.access_token}`));
    const noa = people.find((p) => p.id === other.id)!;
    expect(noa).toMatchObject({ name: "נועה כהן", role: "cadet", phone: null });
    expect(people.some((p) => p.id === me.id)).toBe(true);
  });

  it("codes are single-use and need the right verifier, redirect and origin", async () => {
    await site("https://once.example.com/");
    const a = await signInFlow("https://once.example.com/", me.id);
    await expect(exchangeCode(db, a.code, pkce().verifier, "https://once.example.com/")).rejects.toThrow(/verifier/);
    await expect(exchangeCode(db, a.code, a.verifier, "https://once.example.com/")).rejects.toThrow(/invalid, used or expired/); // burned
    const b = await signInFlow("https://once.example.com/", me.id);
    await expect(exchangeCode(db, b.code, b.verifier, "https://once.example.com/", "https://evil.example.com")).rejects.toThrow(/does not come from the site/);
    const c = await signInFlow("https://once.example.com/", me.id);
    await expect(exchangeCode(db, c.code, c.verifier, "https://once.example.com/other")).rejects.toThrow(/redirect_uri/);
    const d = await signInFlow("https://once.example.com/", me.id);
    await db.query("update public.oauth_codes set expires_at = now() - interval '1 second'");
    await expect(exchangeCode(db, d.code, d.verifier, "https://once.example.com/")).rejects.toThrow(/expired/);
  });

  it("refuses unknown sites, missing PKCE and sites not approved by the קב״מית", async () => {
    const { challenge } = pkce();
    const q = (redirect_uri: string) => ({ redirect_uri, state: "s", code_challenge: challenge, code_challenge_method: "S256" });
    await expect(validateAuthorize(db, q("https://nobody.example.com/"), me.id)).rejects.toThrow(/לא רשום/);
    await site("https://waiting.example.com/", { status: "pending", kabam: "pending" });
    await expect(validateAuthorize(db, q("https://waiting.example.com/"), me.id)).rejects.toThrow(/עדיין לא אושר/);
    await site("https://nokabam.example.com/", { kabam: "pending" });
    await expect(validateAuthorize(db, q("https://nokabam.example.com/"), me.id)).rejects.toThrow(/עדיין לא אושר/);
    await site("https://plain.example.com/");
    await expect(validateAuthorize(db, { redirect_uri: "https://plain.example.com/", state: "s" }, me.id)).rejects.toThrow(/PKCE/);
  });

  it("the person who suggested a pending site may test it; nobody else", async () => {
    await site("https://mine.example.com/", { status: "pending", kabam: "pending", submittedBy: me.id });
    const { code, verifier } = await signInFlow("https://mine.example.com/", me.id);
    const { token } = await exchangeCode(db, code, verifier, "https://mine.example.com/");
    await expect(verifyToken(db, `Bearer ${token.access_token}`)).resolves.toMatchObject({ userId: me.id });
    const { challenge } = pkce();
    await expect(
      validateAuthorize(db, { redirect_uri: "https://mine.example.com/", state: "s", code_challenge: challenge, code_challenge_method: "S256" }, other.id),
    ).rejects.toThrow(/עדיין לא אושר/);
  });

  it("tokens die when the user is blocked, the site loses approval, or the user disconnects", async () => {
    const sid = await site("https://cut.example.com/", { directory: true });
    const run = async (uid: string) => {
      const { code, verifier } = await signInFlow("https://cut.example.com/", uid);
      return `Bearer ${(await exchangeCode(db, code, verifier, "https://cut.example.com/")).token.access_token}`;
    };
    const blocked = await user(db, "חסום");
    const tb = await run(blocked.id);
    await db.query("update public.profiles set status = 'blocked' where id = $1", [blocked.id]);
    await expect(verifyToken(db, tb)).rejects.toThrow(/invalid or expired/);

    const t1 = await run(me.id);
    await db.query("update public.app_submissions set directory_allowed = false where id = $1", [sid]);
    await expect(directory(db, await verifyToken(db, t1))).rejects.toThrow(/קב״מית/);
    await db.query("update public.app_submissions set kabam_status = 'rejected' where id = $1", [sid]);
    await expect(verifyToken(db, t1)).rejects.toThrow(/not approved/);

    await db.query("update public.app_submissions set kabam_status = 'approved' where id = $1", [sid]);
    const t2 = await run(me.id);
    await disconnectSite(db, me.id, sid);
    await expect(verifyToken(db, t2)).rejects.toThrow(/invalid or expired/);
    await expect(verifyToken(db, "Bearer nonsense-token-that-is-long-enough")).rejects.toThrow(/invalid or expired/);
    await expect(verifyToken(db, null)).rejects.toThrow(/missing/);
  });

  it("remembers consent, and asks again when a site gains the directory", async () => {
    const sid = await site("https://consent.example.com/");
    expect(await hasConsent(db, sid, me.id, false)).toBe(false);
    await grantConsent(db, sid, me.id, false);
    expect(await hasConsent(db, sid, me.id, false)).toBe(true);
    expect(await hasConsent(db, sid, me.id, true)).toBe(false);
  });

  it("the קב״מית is a position holder", async () => {
    expect(await isKabam(db, me.id)).toBe(false);
    await db.query(
      `insert into public.position_holders (position_id, profile_id, status) select id, $1, 'approved' from public.positions where key = 'kabam'`,
      [me.id],
    );
    expect(await isKabam(db, me.id)).toBe(true);
  });
});
