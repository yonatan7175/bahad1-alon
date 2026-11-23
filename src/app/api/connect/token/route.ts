// "התחברות עם צ1", step 2: the site swaps the one-time code (+ PKCE verifier) for an access token.
// Accepts JSON or application/x-www-form-urlencoded (standard OAuth clients send the latter).
import { ConnectError, exchangeCode } from "@/platform/auth/connect";
import { getDb } from "@/platform/server/db";
import { preflight, rateLimit, respond } from "@/platform/server/connect-http";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function POST(req: Request) {
  return respond(req, async () => {
    const text = await req.text();
    if (text.length > 4096) throw new ConnectError("invalid_request", "request too large");
    const ct = (req.headers.get("content-type") ?? "").toLowerCase();
    let p: Record<string, unknown>;
    try {
      p = ct.startsWith("application/json") ? (JSON.parse(text) as Record<string, unknown>) : Object.fromEntries(new URLSearchParams(text));
    } catch {
      throw new ConnectError("invalid_request", "invalid body");
    }
    if (p.grant_type !== undefined && p.grant_type !== "authorization_code") throw new ConnectError("invalid_request", "grant_type must be authorization_code");
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
    await rateLimit(`token:${ip}`, 30);
    const origin = req.headers.get("origin");
    const r = await exchangeCode(await getDb(), String(p.code ?? ""), String(p.code_verifier ?? ""), String(p.redirect_uri ?? ""), origin);
    return { body: r.token, origin };
  });
}
