// Next.js 16 "proxy" (formerly middleware). Runs before every page/API request:
//   1. refreshes the Supabase session cookies (Supabase mode)
//   2. optimistic sign-in redirect for pages (real checks: every page + every API call)
//   3. per-request nonce + strict Content-Security-Policy for portal pages
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { MOCK_COOKIE, SESSION_COOKIE } from "@/platform/auth/constants";
import { REGISTRY } from "@/generated/registry";
import { linkFrameOrigin } from "@/lib/embed";

// Owner-approved outside sites (tier "external") may be framed ONLY on their own app page,
// so no other page (e.g. a simple app's sandboxed frame) can navigate to them.
const EXTERNAL_ORIGIN_BY_PATH = new Map(
  REGISTRY.filter((a) => a.tier === "external" && a.url).map((a) => [`/a/${a.slug}`, new URL(a.url!).origin]),
);
function frameSrc(pathname: string): string {
  // Admin-approved websites ("הוספת אפליקציה"): /l/<id>/<host> may frame https://<host> only.
  const ext = EXTERNAL_ORIGIN_BY_PATH.get(pathname.replace(/\/$/, "")) ?? linkFrameOrigin(pathname);
  return ext ? `'self' ${ext}` : "'self'";
}

// /kabam = דבר הקב״מית: the security officer's guidelines, linked from the sign-in page (read before registering).
const PUBLIC_PREFIXES = ["/signin", "/auth/", "/blocked", "/api/", "/kabam"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/")));
}

function buildCsp(nonce: string, https: boolean, pathname: string): string {
  const dev = process.env.NODE_ENV === "development";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaHttps = supabase ? new URL(supabase).origin : "";
  const supaWss = supabase ? supaHttps.replace(/^https:/, "wss:") : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://*.googleusercontent.com ${supaHttps}`.trim(),
    "font-src 'self'",
    `connect-src 'self' ${supaHttps} ${supaWss}`.trim(),
    `frame-src ${frameSrc(pathname)}`, // simple apps (+ the approved external app on its own page) — stops frames navigating elsewhere
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const https = (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")) === "https";
  const csp = buildCsp(nonce, https, pathname);

  const requestHeaders = new Headers(request.headers);
  if (!isApi) {
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("content-security-policy", csp);
  }
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  let signedIn = false;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const mode = process.env.BAHAD_AUTH ?? (supabaseUrl ? "supabase" : process.env.GOOGLE_CLIENT_ID ? "google" : "mock");

  if (mode === "mock") {
    signedIn = request.cookies.has(MOCK_COOKIE);
  } else if (mode === "google") {
    // Optimistic only; the signature/expiry/ban check runs in every page and API call (getAuthUser).
    signedIn = request.cookies.has(SESSION_COOKIE);
  } else if (supabaseUrl && anonKey) {
    const supabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list, headers) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
          for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
        },
      },
    });
    // Do not put code between createServerClient and getClaims (refreshes the session).
    const { data } = await supabase.auth.getClaims();
    signedIn = !!data?.claims?.sub;
  }

  if (!signedIn && !isApi && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  if (!isApi) response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|apps/|app-icons/|icons/|fonts/|favicon.ico|sw.js|bahad.js|bahad.css|bahad.d.ts|robots.txt|brand/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
