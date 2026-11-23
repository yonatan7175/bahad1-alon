// /api/connect/* as an outside website sees it: CORS only for the registered site, tokens bound to
// their site's origin, server-to-server calls (no Origin) allowed, every directory read audited.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/platform/server/db", () => ({ getDb: async () => state.db }));

import { issueCode, validateAuthorize } from "@/platform/auth/connect";
import * as tokenRoute from "@/app/api/connect/token/route";
import * as userinfoRoute from "@/app/api/connect/userinfo/route";
import * as peopleRoute from "@/app/api/connect/people/route";
import * as revokeRoute from "@/app/api/connect/revoke/route";
import type { Db } from "@/platform/server/db-core";
import { testDb, user, type TestUser } from "../support/db";

const SITE = "https://hub.example.com";
let db: Db;
let me: TestUser;
let siteId: string;
beforeAll(async () => {
  db = await testDb();
  state.db = db;
  me = await user(db, "ישראל ישראלי");
  const { rows } = await db.query<{ id: string }>(
    `insert into public.app_submissions (kind, name, url, status, kabam_status, connect, want_directory, directory_allowed)
     values ('url', 'האב', $1, 'approved', 'approved', true, true, true) returning id`,
    [`${SITE}/`],
  );
  siteId = rows[0].id;
});

async function getToken(): Promise<string> {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const req = await validateAuthorize(db, { redirect_uri: `${SITE}/`, state: "x", code_challenge: challenge, code_challenge_method: "S256" }, me.id);
  const code = new URL(await issueCode(db, req, me.id)).searchParams.get("code")!;
  const res = await tokenRoute.POST(
    new Request("https://portal.test/api/connect/token", {
      method: "POST",
      headers: { origin: SITE, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: `${SITE}/` }),
    }),
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("access-control-allow-origin")).toBe(SITE);
  return ((await res.json()) as { access_token: string }).access_token;
}
const get = (route: { GET: (r: Request) => Promise<Response> }, token: string | null, origin?: string) =>
  route.GET(new Request("https://portal.test/api/connect/x", { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}) } }));

describe("/api/connect", () => {
  it("preflight: CORS only for registered sites", async () => {
    const ok = await tokenRoute.OPTIONS(new Request("https://portal.test/api/connect/token", { method: "OPTIONS", headers: { origin: SITE } }));
    expect(ok.headers.get("access-control-allow-origin")).toBe(SITE);
    expect(ok.headers.get("access-control-allow-credentials")).toBeNull();
    const evil = await tokenRoute.OPTIONS(new Request("https://portal.test/api/connect/token", { method: "OPTIONS", headers: { origin: "https://evil.example.com" } }));
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("userinfo from the site's browser and from its server; never from another site", async () => {
    const token = await getToken();
    const fromSite = await get(userinfoRoute, token, SITE);
    expect(fromSite.status).toBe(200);
    expect(((await fromSite.json()) as { id: string }).id).toBe(me.id);
    expect((await get(userinfoRoute, token)).status).toBe(200); // server-to-server
    const evil = await get(userinfoRoute, token, "https://evil.example.com");
    expect(evil.status).toBe(403);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    const none = await get(userinfoRoute, null, SITE);
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toMatch(/invalid_token/);
  });

  it("people: the directory, written to the audit log", async () => {
    const token = await getToken();
    const res = await get(peopleRoute, token, SITE);
    expect(res.status).toBe(200);
    const { people } = (await res.json()) as { people: { id: string }[] };
    expect(people.some((p) => p.id === me.id)).toBe(true);
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.audit_log where action = 'site.directory_read' and target = $1", [siteId]);
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("revoke signs the site out at once", async () => {
    const token = await getToken();
    const r = await revokeRoute.POST(new Request("https://portal.test/api/connect/revoke", { method: "POST", headers: { authorization: `Bearer ${token}`, origin: SITE } }));
    expect(r.status).toBe(200);
    expect((await get(userinfoRoute, token, SITE)).status).toBe(401);
  });
});

describe("/api/connect/revoke", () => {
  it("another site cannot sign a user out of this one", async () => {
    const token = await getToken();
    const r = await revokeRoute.POST(new Request("https://portal.test/api/connect/revoke", { method: "POST", headers: { authorization: `Bearer ${token}`, origin: "https://evil.example.com" } }));
    expect(r.status).toBe(403);
    expect((await get(userinfoRoute, token, SITE)).status).toBe(200);
  });
});
