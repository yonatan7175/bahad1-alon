// Direct Google sign-in, step 2: Google → here with ?code=…&state=… (BAHAD_AUTH=google only).
import { cookies } from "next/headers";
import { authMode } from "@/platform/server/config";
import { finishFlow, makeSessionValue, readFlow, SESSION_MAX_AGE, upsertIdentity } from "@/platform/auth/google";
import { GOOGLE_FLOW_COOKIE, SESSION_COOKIE } from "@/platform/auth/constants";
import { safeNext } from "@/platform/auth/session";
import { isHttps, redirectTo } from "@/platform/server/redirect";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (authMode() !== "google") return new Response("not found", { status: 404 });
  const url = new URL(req.url);
  const store = await cookies();
  const flow = readFlow(store.get(GOOGLE_FLOW_COOKIE)?.value, url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  const fail = () => {
    const r = redirectTo("/signin?error=1", 302);
    r.cookies.set(GOOGLE_FLOW_COOKIE, "", { path: "/auth/google", maxAge: 0 });
    return r;
  };
  if (!flow || !code) {
    if (url.searchParams.get("error")) console.warn("[auth] google returned", url.searchParams.get("error"));
    else console.warn("[auth] google callback without a valid flow cookie/state");
    return fail();
  }
  let userId: string;
  try {
    userId = await upsertIdentity(await finishFlow(flow, code));
  } catch (e) {
    console.error("[auth] google sign-in failed:", e instanceof Error ? e.message : e);
    return fail();
  }
  const res = redirectTo(safeNext(flow.next), 302);
  res.cookies.set(GOOGLE_FLOW_COOKIE, "", { path: "/auth/google", maxAge: 0 });
  res.cookies.set(SESSION_COOKIE, makeSessionValue(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
