// Mock sign-in (local development and automated tests ONLY — authMode() refuses
// mock mode in production builds unless BAHAD_ALLOW_MOCK=1).
import { authMode } from "@/platform/server/config";
import { isSameOrigin } from "@/platform/server/http";
import { getDb } from "@/platform/server/db";
import { createMockUser, mockUserById } from "@/platform/auth/mock";
import { MOCK_COOKIE } from "@/platform/auth/constants";
import { safeNext } from "@/platform/auth/session";
import { isHttps, redirectTo } from "@/platform/server/redirect";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (authMode() !== "mock") return new Response("not found", { status: 404 });
  if (!isSameOrigin(req)) return new Response("forbidden", { status: 403 });
  const form = await req.formData();
  const action = form.get("action");
  const next = safeNext(String(form.get("next") ?? "/"));
  let userId: string | null = null;
  if (action === "login") {
    const u = await mockUserById(String(form.get("userId") ?? ""));
    userId = u?.id ?? null;
  } else if (action === "create") {
    const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 120);
    const name = String(form.get("name") ?? "").trim().slice(0, 60);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) return new Response("invalid", { status: 400 });
    userId = await createMockUser(await getDb(), email, name);
  }
  if (!userId) return redirectTo("/signin?error=1");
  const res = redirectTo(next);
  res.cookies.set(MOCK_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
