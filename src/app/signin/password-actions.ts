"use server";
// Username + password sign-in / registration (BAHAD_AUTH=google). Server actions are same-origin only (Next checks Origin).
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { passwordLoginEnabled } from "@/platform/server/config";
import { getDb } from "@/platform/server/db";
import { audit } from "@/platform/server/audit";
import { makeSessionValue, SESSION_MAX_AGE } from "@/platform/auth/google";
import { SESSION_COOKIE } from "@/platform/auth/constants";
import { loginPasswordUser, registerPasswordUser } from "@/platform/auth/password";
import { safeNext } from "@/platform/auth/session";

export interface PasswordState {
  error?: string;
}

async function startSession(userId: string) {
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim();
  (await cookies()).set(SESSION_COOKIE, makeSessionValue(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function passwordSignIn(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  if (!passwordLoginEnabled()) return { error: "כניסה עם שם משתמש אינה זמינה." };
  const r = await loginPasswordUser(await getDb(), String(form.get("username") ?? ""), String(form.get("password") ?? ""));
  if (!r.ok) return { error: r.error };
  await startSession(r.userId);
  redirect(safeNext(String(form.get("next") ?? "/")));
}

export async function passwordRegister(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  if (!passwordLoginEnabled()) return { error: "הרשמה עם שם משתמש אינה זמינה." };
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "הסיסמאות לא תואמות." };
  const db = await getDb();
  const r = await registerPasswordUser(db, String(form.get("username") ?? ""), password);
  if (!r.ok) return { error: r.error };
  await audit(db, r.userId, "user.register_password", r.userId, {});
  await startSession(r.userId);
  // Same next step as a first Google sign-in: the registration form (פלוגה, צוות, חדר, טלפון).
  redirect("/onboarding");
}
