import "server-only";
// HTTP plumbing for /api/connect/* (called by outside websites). CORS is allowed only for the origin
// of a registered connected site, and never with cookies: these endpoints authenticate with a
// Bearer token only, so there is nothing for another site to forge (no CSRF).
import { BahadError } from "../errors";
import { ConnectError, cleanRedirect, type TokenInfo } from "../auth/connect";
import { getDb } from "./db";
import { hit } from "./engine";

const STATUS: Record<ConnectError["code"], number> = {
  invalid_request: 400,
  unauthorized_client: 400,
  access_denied: 403,
  invalid_grant: 400,
  invalid_token: 401,
  insufficient_scope: 403,
};

function cors(origin: string | null): Record<string, string> {
  return origin
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-max-age": "600",
        vary: "Origin",
      }
    : { vary: "Origin" };
}

/** Is this the origin of a connected site (approved or waiting)? Used for CORS preflights. */
async function knownOrigin(origin: string | null): Promise<boolean> {
  if (!origin || origin === "null") return false;
  const o = cleanRedirect(origin + "/")?.origin;
  if (!o) return false;
  const { rows } = await (await getDb()).query(
    "select 1 from public.app_submissions where kind = 'url' and connect and status <> 'rejected' and url like $1 || '%' limit 1",
    [o + "/"],
  );
  return rows.length > 0;
}

export async function preflight(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  return new Response(null, { status: 204, headers: (await knownOrigin(origin)) ? cors(origin) : { vary: "Origin" } });
}

/** A browser call must come from the token's own site; server-to-server calls (no Origin) are fine. */
export function checkOrigin(req: Request, t: TokenInfo): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  if (origin !== new URL(t.site.url).origin) throw new ConnectError("access_denied", "this token belongs to another site");
  return origin;
}

export async function rateLimit(key: string, perMinute: number): Promise<void> {
  try {
    await hit(await getDb(), `connect:${key}`, "minute", perMinute, "too many requests");
  } catch (e) {
    if (e instanceof BahadError && e.code === "rate_limited") throw new RateLimited();
    throw e;
  }
}
class RateLimited extends Error {}

/** Runs a handler and turns the result / errors into JSON with the right CORS headers. */
export async function respond(req: Request, fn: () => Promise<{ body: unknown; origin: string | null }>): Promise<Response> {
  const reqOrigin = req.headers.get("origin");
  try {
    const { body, origin } = await fn();
    return Response.json(body, { headers: { "cache-control": "no-store", ...cors(origin) } });
  } catch (e) {
    // Errors carry CORS only for known sites, so their own developer can read the message.
    const allow = (await knownOrigin(reqOrigin)) ? reqOrigin : null;
    const headers: Record<string, string> = { "cache-control": "no-store", ...cors(allow) };
    if (e instanceof RateLimited) return Response.json({ error: "rate_limited", error_description: "too many requests" }, { status: 429, headers });
    if (e instanceof ConnectError) {
      if (e.code === "invalid_token") headers["www-authenticate"] = `Bearer error="invalid_token"`;
      return Response.json({ error: e.code, error_description: e.message }, { status: STATUS[e.code], headers });
    }
    console.error("[connect] internal error", e);
    return Response.json({ error: "server_error" }, { status: 500, headers });
  }
}
