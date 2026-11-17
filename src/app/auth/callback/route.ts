// Google → Supabase → here with ?code=… ; exchanges it for a session cookie.
import { redirectTo } from "@/platform/server/redirect";
import { serverSupabase } from "@/platform/auth/supabase";
import { safeNext } from "@/platform/auth/session";
import { authMode } from "@/platform/server/config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  if (authMode() !== "supabase" || !code) return redirectTo("/signin?error=1", 302);
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth] code exchange failed", error.message);
    return redirectTo("/signin?error=1", 302);
  }
  return redirectTo(next, 302);
}
