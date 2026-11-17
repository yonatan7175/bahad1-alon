import "server-only";
// Direct Google sign-in (BAHAD_AUTH=google) — no Supabase.
//   /auth/google/start    → Google (OpenID Connect, authorization code + PKCE + state + nonce)
//   /auth/google/callback → code exchanged server-to-server for an ID token, identity upserted
//                           into the local auth.users table, signed session cookie set.
// The ID token comes straight from Google's token endpoint over TLS, so per OIDC Core §3.1.3.7
// its signature check may be skipped; the claims (iss, aud, exp, nonce, email_verified) are checked.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb } from "../server/db";
import { googleConfig } from "../server/config";
import type { AuthUser } from "./index";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const FLOW_MAX_AGE = 60 * 10; // 10 minutes to finish signing in at Google

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const b64url = (b: Buffer) => b.toString("base64url");

// ─── Signed values (HMAC-SHA256 with BAHAD_SESSION_SECRET) ───────────────────────────
function sign(payload: string, purpose: string): string {
  const mac = createHmac("sha256", googleConfig().sessionSecret).update(`${purpose}\n${payload}`).digest();
  return `${b64url(Buffer.from(payload))}.${b64url(mac)}`;
}

function unsign(value: string | undefined, purpose: string): string | null {
  if (!value) return null;
  const [p, m] = value.split(".");
  if (!p || !m) return null;
  const payload = Buffer.from(p, "base64url").toString();
  const expected = createHmac("sha256", googleConfig().sessionSecret).update(`${purpose}\n${payload}`).digest();
  const got = Buffer.from(m, "base64url");
  return got.length === expected.length && timingSafeEqual(got, expected) ? payload : null;
}

// ─── Session cookie ──────────────────────────────────────────────────────────────────
export function makeSessionValue(userId: string): string {
  return sign(JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE }), "session");
}

/** The user for a session cookie value, or null (bad signature, expired, deleted or blocked identity). */
export async function userFromSession(value: string | undefined): Promise<AuthUser | null> {
  const raw = unsign(value, "session");
  if (!raw) return null;
  let s: { uid?: unknown; exp?: unknown };
  try {
    s = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof s.uid !== "string" || !uuidRe.test(s.uid) || typeof s.exp !== "number" || s.exp < Date.now() / 1000) return null;
  const db = await getDb();
  const { rows } = await db.query<{ id: string; email: string; meta: Record<string, string> }>(
    `select id, email, raw_user_meta_data as meta from auth.users
      where id = $1 and (banned_until is null or banned_until < now())`,
    [s.uid],
  );
  const u = rows[0];
  if (!u) return null;
  return { id: u.id, email: u.email ?? "", name: u.meta?.full_name ?? null, avatarUrl: u.meta?.avatar_url ?? null };
}

// ─── OAuth flow ──────────────────────────────────────────────────────────────────────
interface Flow {
  state: string;
  verifier: string;
  nonce: string;
  next: string;
  redirectUri: string;
}

/** Builds the Google URL and the signed flow cookie value for /auth/google/start. */
export function beginFlow(redirectUri: string, next: string): { url: string; cookie: string } {
  const { clientId } = googleConfig();
  const flow: Flow = {
    state: b64url(randomBytes(24)),
    verifier: b64url(randomBytes(48)),
    nonce: b64url(randomBytes(24)),
    next,
    redirectUri,
  };
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: b64url(createHash("sha256").update(flow.verifier).digest()),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), cookie: sign(JSON.stringify(flow), "flow") };
}

export function readFlow(cookie: string | undefined, state: string | null): Flow | null {
  const raw = unsign(cookie, "flow");
  if (!raw || !state) return null;
  try {
    const f = JSON.parse(raw) as Flow;
    const a = Buffer.from(f.state);
    const b = Buffer.from(state);
    return a.length === b.length && timingSafeEqual(a, b) ? f : null;
  } catch {
    return null;
  }
}

interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

/** Exchanges the authorization code and validates the ID token claims. */
export async function finishFlow(flow: Flow, code: string): Promise<GoogleIdentity> {
  const { clientId, clientSecret } = googleConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: flow.redirectUri,
      grant_type: "authorization_code",
      code_verifier: flow.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.id_token) throw new Error(`token exchange failed: ${body.error ?? res.status} ${body.error_description ?? ""}`);
  const part = body.id_token.split(".")[1];
  if (!part) throw new Error("malformed id_token");
  const c = JSON.parse(Buffer.from(part, "base64url").toString()) as Record<string, unknown>;
  const now = Date.now() / 1000;
  if (!ISSUERS.has(String(c.iss))) throw new Error("bad iss");
  if (c.aud !== clientId) throw new Error("bad aud");
  if (typeof c.exp !== "number" || c.exp < now - 60) throw new Error("expired id_token");
  if (c.nonce !== flow.nonce) throw new Error("bad nonce");
  if (typeof c.sub !== "string" || !c.sub) throw new Error("no sub");
  if (typeof c.email !== "string" || c.email_verified !== true) throw new Error("email not verified");
  return {
    sub: c.sub,
    email: c.email.toLowerCase(),
    name: typeof c.name === "string" ? c.name : null,
    picture: typeof c.picture === "string" ? c.picture : null,
  };
}

/**
 * Finds the identity by Google's stable `sub` (never by email), creating it on first sign-in.
 * The auth.users insert trigger creates the pending profile, exactly as with Supabase.
 */
export async function upsertIdentity(g: GoogleIdentity): Promise<string> {
  const db = await getDb();
  const meta = JSON.stringify({ full_name: g.name, avatar_url: g.picture, google_sub: g.sub });
  const found = await db.query<{ id: string }>(
    `update auth.users set email = $2, raw_user_meta_data = raw_user_meta_data || $3::jsonb
      where raw_user_meta_data ->> 'google_sub' = $1 returning id`,
    [g.sub, g.email, meta],
  );
  if (found.rows[0]) return found.rows[0].id;
  const created = await db.query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id",
    [g.email, meta],
  );
  return created.rows[0].id;
}

/** Where Google sends the browser back: NEXT_PUBLIC_SITE_URL, else the address the browser used. */
export function redirectUriFor(req: Request): string {
  const { siteUrl } = googleConfig();
  if (siteUrl) return `${siteUrl}/auth/google/callback`;
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() ?? req.headers.get("host") ?? u.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? u.protocol.replace(":", "");
  return `${proto}://${host}/auth/google/callback`;
}
