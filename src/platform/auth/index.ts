import "server-only";
// The swappable login layer (plan 03). Everything that knows HOW a user signs in
// lives in this folder. Apps and the rest of the portal only see getAuthUser().
// Moving to an official IDF identity provider later = a new adapter here.
import { cache } from "react";
import { cookies } from "next/headers";
import { authMode } from "../server/config";
import { MOCK_COOKIE, SESSION_COOKIE } from "./constants";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

/** The signed-in user for this request, verified. Cached per request. */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  if (authMode() === "mock") {
    const { mockUserById } = await import("./mock");
    const uid = (await cookies()).get(MOCK_COOKIE)?.value;
    return uid ? mockUserById(uid) : null;
  }
  if (authMode() === "google") {
    const { userFromSession } = await import("./google");
    return userFromSession((await cookies()).get(SESSION_COOKIE)?.value);
  }
  const { serverSupabase } = await import("./supabase");
  const supabase = await serverSupabase();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const c = data.claims as { sub: string; email?: string; user_metadata?: Record<string, unknown> };
  const meta = c.user_metadata ?? {};
  return {
    id: c.sub,
    email: c.email ?? "",
    name: (meta.full_name as string) ?? (meta.name as string) ?? null,
    avatarUrl: (meta.avatar_url as string) ?? (meta.picture as string) ?? null,
  };
});

export async function signOut(): Promise<void> {
  if (authMode() === "mock") {
    (await cookies()).delete(MOCK_COOKIE);
    return;
  }
  if (authMode() === "google") {
    (await cookies()).delete(SESSION_COOKIE);
    return;
  }
  const { serverSupabase } = await import("./supabase");
  const supabase = await serverSupabase();
  await supabase.auth.signOut();
}

/**
 * Block / unblock at the identity provider too, so a blocked user's sessions
 * stop refreshing ("signed out everywhere"). The API also re-checks status on every call.
 */
export async function setProviderBan(userId: string, banned: boolean): Promise<void> {
  if (authMode() === "mock") return;
  if (authMode() === "google") {
    // Own identity table: a banned identity's session cookie stops resolving (see userFromSession).
    const { getDb } = await import("../server/db");
    await (await getDb()).query(
      "update auth.users set banned_until = case when $2 then 'infinity'::timestamptz else null end where id = $1",
      [userId, banned],
    );
    return;
  }
  const { adminSupabase } = await import("./supabase");
  const admin = adminSupabase();
  if (!admin) {
    console.warn("[auth] SUPABASE_SERVICE_ROLE_KEY missing — cannot revoke sessions at Supabase; API checks still block the user");
    return;
  }
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: banned ? "876000h" : "none" });
  if (error) console.error("[auth] ban update failed", error.message);
}

/** Permanently deletes the identity (cascades to the profile and all its records). */
export async function deleteIdentity(userId: string): Promise<void> {
  if (authMode() === "mock" || authMode() === "google") {
    const { getDb } = await import("../server/db");
    await (await getDb()).query("delete from auth.users where id = $1", [userId]);
    return;
  }
  const { adminSupabase } = await import("./supabase");
  const admin = adminSupabase();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to delete users");
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  const { authShim } = await import("../server/config");
  if (authShim()) {
    // Own Postgres: the local mirror row owns the profile (cascade).
    const { getDb } = await import("../server/db");
    await (await getDb()).query("delete from auth.users where id = $1", [userId]);
  }
}
