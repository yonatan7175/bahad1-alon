import "server-only";
// The portal's view of "who is this": auth identity + profile row, with the
// lifecycle redirects from plan 03 (pending → onboarding/pending, blocked → /blocked).
import { cache } from "react";
import { redirect } from "next/navigation";
import { getAuthUser, type AuthUser } from "./index";
import { getDb } from "../server/db";
import { adminEmails, authShim, requireApproval } from "../server/config";
import { loadProfile, type ProfileRow } from "../server/engine";
import { audit } from "../server/audit";

export type Profile = ProfileRow;

export interface Session {
  auth: AuthUser;
  profile: Profile;
}

export const getSession = cache(async (): Promise<Session | null> => {
  const auth = await getAuthUser();
  if (!auth) return null;
  const db = await getDb();
  let profile = await loadFull(auth.id);
  if (!profile && authShim()) {
    // Own Postgres + Supabase Auth (LINUX.md, option B): auth.users is the local shim table,
    // so mirror the identity into it; the trigger then creates the pending profile.
    await db.query(
      `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb) on conflict (id) do nothing`,
      [auth.id, auth.email, JSON.stringify({ full_name: auth.name, avatar_url: auth.avatarUrl })],
    );
    profile = await loadFull(auth.id);
  }
  if (!profile) {
    // Normally created by the auth.users trigger; this covers identities that existed before the migration.
    await db.query(
      `insert into public.profiles (id, email, full_name, avatar_url) values ($1, $2, $3, $4) on conflict (id) do nothing`,
      [auth.id, auth.email, auth.name, auth.avatarUrl],
    );
    profile = await loadFull(auth.id);
    if (!profile) return null;
  }
  // Bootstrap: BAHAD_ADMIN_EMAILS become approved admins on sign-in (never blocked ones).
  if (
    auth.email &&
    adminEmails().includes(auth.email.toLowerCase()) &&
    profile.status !== "blocked" &&
    (profile.role !== "admin" || profile.status !== "approved")
  ) {
    await db.query(
      `update public.profiles set role = 'admin', status = 'approved', approved_at = coalesce(approved_at, now()),
              onboarded_at = coalesce(onboarded_at, now()) where id = $1`,
      [auth.id],
    );
    await audit(db, auth.id, "user.bootstrap_admin", auth.id, { email: auth.email });
    profile = (await loadFull(auth.id))!;
  }
  // Open registration (default): whoever finished registering is approved — including users who
  // registered while approval was still required. Blocked users stay blocked.
  if (profile.status === "pending" && profile.onboarded_at && !requireApproval()) {
    await db.query("update public.profiles set status = 'approved', approved_at = coalesce(approved_at, now()) where id = $1 and status = 'pending'", [auth.id]);
    await audit(db, null, "user.auto_approve", auth.id, { email: auth.email });
    profile = (await loadFull(auth.id))!;
  }
  return { auth, profile };
});

async function loadFull(id: string): Promise<Profile | null> {
  return loadProfile(await getDb(), id);
}

/** For pages: returns an approved session or redirects to the right lifecycle page. */
export async function requireApproved(nextPath: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/signin?next=${encodeURIComponent(nextPath)}`);
  if (s.profile.status === "blocked") redirect("/blocked");
  if (s.profile.status === "pending") redirect(s.profile.onboarded_at ? "/pending" : "/onboarding");
  return s;
}

export async function requireAdmin(nextPath: string): Promise<Session> {
  const s = await requireApproved(nextPath);
  if (s.profile.role !== "admin") redirect("/");
  return s;
}

/** Safe "next" parameter: only same-site absolute paths. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return "/";
  return next;
}
