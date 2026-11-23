import "server-only";
// "התחברות עם צ1" — the portal as an OAuth 2 identity provider for approved outside websites
// (authorization code + PKCE S256, public clients: most sites are static and have no secret).
//
//   site → /oauth/authorize?redirect_uri&state&code_challenge&code_challenge_method=S256[&client_id]
//        → (sign in) → consent once per site → redirect_uri?code&state
//   site → POST /api/connect/token {code, code_verifier, redirect_uri} → { access_token (24 h) }
//   site → GET /api/connect/userinfo | /api/connect/people   (Authorization: Bearer <token>)
//
// A site is identified by its registered URL: redirect_uri must be on the same origin and under the
// same path. client_id (the submission id) is optional. Tokens are read-only: the signed-in user,
// plus the battalion directory when the קב״מית allowed it. Nothing here can write to the portal.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Db } from "../server/db-core";
import { getPerson, listPeople, type Person } from "../server/directory";

export const CODE_TTL_SECONDS = 60;
export const TOKEN_TTL_SECONDS = 24 * 60 * 60;

export interface ConnectSite {
  id: string;
  name: string;
  url: string;
  emoji: string;
  icon: string | null;
  status: "pending" | "approved" | "rejected";
  kabam_status: "pending" | "approved" | "rejected" | null;
  directory_allowed: boolean;
  submitted_by: string | null;
}

export class ConnectError extends Error {
  constructor(
    public code: "invalid_request" | "unauthorized_client" | "access_denied" | "invalid_grant" | "invalid_token" | "insufficient_scope",
    message: string,
  ) {
    super(message);
  }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("base64url");
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** origin + path of a URL (no query/hash), or null. https only (local development uses the SDK's mock mode). */
export function cleanRedirect(raw: string | null | undefined): { origin: string; path: string; href: string } | null {
  if (!raw || raw.length > 400) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  return { origin: u.origin, path: u.pathname || "/", href: u.origin + (u.pathname || "/") };
}

/** Is `redirect` under `registered` (same origin, path at or below the registered path)? */
export function redirectMatches(registered: string, redirect: string): boolean {
  const a = cleanRedirect(registered);
  const b = cleanRedirect(redirect);
  if (!a || !b || a.origin !== b.origin) return false;
  const base = a.path.endsWith("/") ? a.path : a.path + "/";
  return b.path === a.path || b.path.startsWith(base) || (a.path.endsWith("/") && b.path === a.path.slice(0, -1));
}

const SITE_COLS = "id, name, url, emoji, icon, status, kabam_status, directory_allowed, submitted_by";

/** Usable for sign-in: approved by the קב״מית (or before the directive) AND by an admin. */
export function siteLive(s: ConnectSite): boolean {
  return s.status === "approved" && (s.kabam_status === "approved" || s.kabam_status === null);
}

/** The connected site a redirect_uri belongs to (longest matching registered path wins). */
export async function findSite(db: Db, redirectUri: string, clientId?: string | null): Promise<ConnectSite | null> {
  const r = cleanRedirect(redirectUri);
  if (!r) return null;
  const { rows } = await db.query<ConnectSite>(
    `select ${SITE_COLS} from public.app_submissions where kind = 'url' and connect and status <> 'rejected' and url like $1 || '%'`,
    [r.origin + "/"],
  );
  const matches = rows
    .filter((s) => redirectMatches(s.url, r.href) && (!clientId || s.id === clientId))
    .sort((a, b) => b.url.length - a.url.length);
  return matches[0] ?? null;
}

export async function siteById(db: Db, id: string): Promise<ConnectSite | null> {
  if (!uuidRe.test(id)) return null;
  const { rows } = await db.query<ConnectSite>(`select ${SITE_COLS} from public.app_submissions where id = $1 and kind = 'url' and connect`, [id]);
  return rows[0] ?? null;
}

export interface AuthorizeRequest {
  site: ConnectSite;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

/**
 * Validates /oauth/authorize parameters. Throws when the request must NOT be redirected back
 * (unknown site / bad redirect_uri) — the page shows an error instead.
 * `userId` may use a site that's still waiting for approval only if they suggested it (to test it).
 */
export async function validateAuthorize(db: Db, q: Record<string, string | undefined>, userId: string): Promise<AuthorizeRequest> {
  const redirectUri = q.redirect_uri ?? "";
  const site = await findSite(db, redirectUri, q.client_id || null);
  if (!site) throw new ConnectError("unauthorized_client", "האתר הזה לא רשום להתחברות עם צ1.");
  if (!siteLive(site) && !(site.status === "pending" && site.submitted_by === userId)) {
    throw new ConnectError("unauthorized_client", "האתר הזה עדיין לא אושר (קב״מית ומנהל האתר).");
  }
  if (q.response_type && q.response_type !== "code") throw new ConnectError("invalid_request", "response_type must be code");
  const state = q.state ?? "";
  if (!state || state.length > 200) throw new ConnectError("invalid_request", "state is required");
  const codeChallenge = q.code_challenge ?? "";
  if (q.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
    throw new ConnectError("invalid_request", "PKCE (code_challenge_method=S256) is required");
  }
  return { site, redirectUri: cleanRedirect(redirectUri)!.href, state, codeChallenge };
}

/** Has the user already approved this site (with at least what it gets now)? */
export async function hasConsent(db: Db, siteId: string, userId: string, directory: boolean): Promise<boolean> {
  const { rows } = await db.query<{ directory: boolean }>("select directory from public.oauth_consents where site_id = $1 and user_id = $2", [siteId, userId]);
  return !!rows[0] && (rows[0].directory || !directory);
}

export async function grantConsent(db: Db, siteId: string, userId: string, directory: boolean): Promise<void> {
  await db.query(
    `insert into public.oauth_consents (site_id, user_id, directory) values ($1, $2, $3)
     on conflict (site_id, user_id) do update set directory = excluded.directory, granted_at = now()`,
    [siteId, userId, directory],
  );
}

/** Issues the one-time code and returns the full redirect URL (redirect_uri?code&state). */
export async function issueCode(db: Db, req: AuthorizeRequest, userId: string): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await db.query("delete from public.oauth_codes where expires_at < now()");
  await db.query(
    `insert into public.oauth_codes (code_hash, site_id, user_id, redirect_uri, code_challenge, directory, expires_at)
     values ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7))`,
    [sha256(code), req.site.id, userId, req.redirectUri, req.codeChallenge, req.site.directory_allowed, CODE_TTL_SECONDS],
  );
  return withParams(req.redirectUri, { code, state: req.state });
}

export function withParams(uri: string, params: Record<string, string>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export interface IssuedToken {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}

/** POST /api/connect/token: single-use code + PKCE verifier → access token. */
export async function exchangeCode(
  db: Db,
  code: string,
  verifier: string,
  redirectUri: string,
  /** The browser's Origin header, when called from a browser: must be the site's own origin. */
  origin?: string | null,
): Promise<{ token: IssuedToken; siteId: string; userId: string }> {
  if (!code || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new ConnectError("invalid_request", "code and a valid code_verifier are required");
  const { rows } = await db.query<{ site_id: string; user_id: string; redirect_uri: string; code_challenge: string; directory: boolean; expired: boolean }>(
    `delete from public.oauth_codes where code_hash = $1
     returning site_id, user_id, redirect_uri, code_challenge, directory, expires_at < now() as expired`,
    [sha256(code)],
  );
  const c = rows[0];
  if (!c || c.expired) throw new ConnectError("invalid_grant", "the code is invalid, used or expired");
  if (cleanRedirect(redirectUri)?.href !== c.redirect_uri) throw new ConnectError("invalid_grant", "redirect_uri does not match");
  if (origin && origin !== new URL(c.redirect_uri).origin) throw new ConnectError("invalid_grant", "the request does not come from the site");
  const a = Buffer.from(sha256(verifier));
  const b = Buffer.from(c.code_challenge);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ConnectError("invalid_grant", "code_verifier does not match");
  const token = randomBytes(32).toString("base64url");
  await db.query("delete from public.oauth_tokens where expires_at < now()");
  await db.query(
    `insert into public.oauth_tokens (token_hash, site_id, user_id, directory, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(secs => $5))`,
    [sha256(token), c.site_id, c.user_id, c.directory, TOKEN_TTL_SECONDS],
  );
  return {
    token: { access_token: token, token_type: "Bearer", expires_in: TOKEN_TTL_SECONDS, scope: c.directory ? "profile directory" : "profile" },
    siteId: c.site_id,
    userId: c.user_id,
  };
}

export interface TokenInfo {
  site: ConnectSite;
  userId: string;
  directory: boolean;
}

/**
 * Bearer token → site + user. Re-checked on every call: token not expired, site still approved,
 * user still approved (a blocked user or a removed site is cut off immediately).
 */
export async function verifyToken(db: Db, authorization: string | null): Promise<TokenInfo> {
  const token = authorization?.match(/^Bearer\s+([A-Za-z0-9_-]{20,100})$/i)?.[1];
  if (!token) throw new ConnectError("invalid_token", "missing bearer token");
  const { rows } = await db.query<ConnectSite & { user_id: string; directory: boolean; user_status: string; stale: boolean }>(
    `select s.id, s.name, s.url, s.emoji, s.icon, s.status, s.kabam_status, s.directory_allowed, s.submitted_by,
            t.user_id, t.directory, p.status as user_status,
            t.last_used_at is null or t.last_used_at < now() - interval '5 minutes' as stale
       from public.oauth_tokens t
       join public.app_submissions s on s.id = t.site_id and s.connect
       join public.profiles p on p.id = t.user_id
      where t.token_hash = $1 and t.expires_at > now()`,
    [sha256(token)],
  );
  const r = rows[0];
  if (!r || r.user_status !== "approved") throw new ConnectError("invalid_token", "the token is invalid or expired");
  const site: ConnectSite = { id: r.id, name: r.name, url: r.url, emoji: r.emoji, icon: r.icon, status: r.status, kabam_status: r.kabam_status, directory_allowed: r.directory_allowed, submitted_by: r.submitted_by };
  if (!siteLive(site) && !(site.status === "pending" && site.submitted_by === r.user_id)) throw new ConnectError("invalid_token", "the site is not approved");
  if (r.stale) await db.query("update public.oauth_tokens set last_used_at = now() where token_hash = $1", [sha256(token)]);
  return { site, userId: r.user_id, directory: r.directory && site.directory_allowed };
}

export async function revokeToken(db: Db, authorization: string | null): Promise<void> {
  const token = authorization?.match(/^Bearer\s+([A-Za-z0-9_-]{20,100})$/i)?.[1];
  if (token) await db.query("delete from public.oauth_tokens where token_hash = $1", [sha256(token)]);
}

/** The user disconnects a site in their profile: consent + all their tokens for it. */
export async function disconnectSite(db: Db, userId: string, siteId: string): Promise<void> {
  await db.query("delete from public.oauth_tokens where user_id = $1 and site_id = $2", [userId, siteId]);
  await db.query("delete from public.oauth_consents where user_id = $1 and site_id = $2", [userId, siteId]);
}

export async function connectedSites(db: Db, userId: string): Promise<{ id: string; name: string; url: string; emoji: string; icon: string | null; directory: boolean; granted_at: Date }[]> {
  const { rows } = await db.query<{ id: string; name: string; url: string; emoji: string; icon: string | null; directory: boolean; granted_at: Date }>(
    `select s.id, s.name, s.url, s.emoji, s.icon, c.directory, c.granted_at
       from public.oauth_consents c join public.app_submissions s on s.id = c.site_id
      where c.user_id = $1 order by c.granted_at desc`,
    [userId],
  );
  return rows;
}

// ─── What a site receives ─────────────────────────────────────────────────────────────
export interface ConnectPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: Person["role"];
  company: string | null;
  platoon: string | null;
  positions: string[];
  /** null when the person hides it in their privacy settings */
  phone: string | null;
  email: string | null;
}
export interface ConnectUser extends ConnectPerson {
  room: string | null;
  companyId: string | null;
  /** What this token may read. */
  scopes: ("profile" | "directory")[];
}

const toConnectPerson = (p: Person): ConnectPerson => ({
  id: p.id,
  name: p.name,
  avatarUrl: p.avatarUrl,
  role: p.role,
  company: p.company,
  platoon: p.platoon,
  positions: p.positions,
  phone: p.phone,
  email: p.email,
});

export async function userInfo(db: Db, t: TokenInfo): Promise<ConnectUser> {
  const p = await getPerson(db, t.userId);
  if (!p) throw new ConnectError("invalid_token", "user not found");
  const { rows } = await db.query<{ room: string | null }>("select room from public.profiles where id = $1", [t.userId]);
  return { ...toConnectPerson(p), room: rows[0]?.room ?? null, companyId: p.companyId, scopes: t.directory ? ["profile", "directory"] : ["profile"] };
}

export async function directory(db: Db, t: TokenInfo): Promise<ConnectPerson[]> {
  if (!t.directory) throw new ConnectError("insufficient_scope", "this site may not read the directory (needs the קב״מית's approval)");
  return (await listPeople(db)).map(toConnectPerson);
}

/** Holders of the קב״מית position (position key 'kabam') approve outside websites. */
export async function isKabam(db: Db, profileId: string): Promise<boolean> {
  const { rows } = await db.query(
    `select 1 from public.position_holders h join public.positions p on p.id = h.position_id
      where p.key = 'kabam' and h.profile_id = $1 and h.status = 'approved' limit 1`,
    [profileId],
  );
  return rows.length > 0;
}
