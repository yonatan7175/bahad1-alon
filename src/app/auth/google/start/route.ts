// Direct Google sign-in, step 1: send the browser to Google (BAHAD_AUTH=google only).
import { NextResponse } from "next/server";
import { authMode, googleConfig } from "@/platform/server/config";
import { beginFlow, FLOW_MAX_AGE, redirectUriFor } from "@/platform/auth/google";
import { GOOGLE_FLOW_COOKIE } from "@/platform/auth/constants";
import { safeNext } from "@/platform/auth/session";
import { isHttps } from "@/platform/server/redirect";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (authMode() !== "google") return new Response("not found", { status: 404 });
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  // The flow cookie must live on the same host Google returns to. If the site was opened
  // under another address (LAN IP, 127.0.0.1…), restart the flow on the canonical one.
  const { siteUrl } = googleConfig();
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() ?? req.headers.get("host");
  if (siteUrl && host && new URL(siteUrl).host !== host) {
    return NextResponse.redirect(`${siteUrl}/auth/google/start?next=${encodeURIComponent(next)}`, { status: 302 });
  }
  const { url, cookie } = beginFlow(redirectUriFor(req), next);
  const res = NextResponse.redirect(url, { status: 302, headers: { "cache-control": "no-store" } });
  res.cookies.set(GOOGLE_FLOW_COOKIE, cookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/auth/google",
    maxAge: FLOW_MAX_AGE,
  });
  return res;
}
