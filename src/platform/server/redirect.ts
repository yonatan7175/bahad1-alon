import { NextResponse } from "next/server";

/**
 * Redirect with a RELATIVE Location header. Building absolute URLs from req.url breaks
 * whenever the server's bind address differs from what the browser used
 * (0.0.0.0, a Tailscale IP, a reverse proxy on Linux…). Browsers resolve relative
 * Locations against the address they actually requested.
 */
export function redirectTo(path: string, status: 302 | 303 | 307 = 303): NextResponse {
  // Header values must be ASCII: percent-encode Hebrew etc. (e.g. /admin?q=מנהל).
  const u = new URL(path, "http://x");
  const location = u.pathname + u.search + u.hash;
  return new NextResponse(null, { status, headers: { location, "cache-control": "no-store" } });
}

/** True when the browser reached us over HTTPS (directly or via a proxy). */
export function isHttps(req: Request): boolean {
  const fwd = req.headers.get("x-forwarded-proto");
  if (fwd) return fwd.split(",")[0].trim() === "https";
  return new URL(req.url).protocol === "https:";
}
