import "server-only";

// All server-side environment reading lives here. See .env.example for docs.

export type AuthMode = "supabase" | "google" | "mock";
export type RealtimeMode = "supabase" | "sse";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

export function authMode(): AuthMode {
  const mode =
    env("BAHAD_AUTH") ?? (env("NEXT_PUBLIC_SUPABASE_URL") ? "supabase" : env("GOOGLE_CLIENT_ID") ? "google" : "mock");
  if (mode !== "supabase" && mode !== "google" && mode !== "mock") {
    throw new Error(`BAHAD_AUTH must be "supabase", "google" or "mock", got "${mode}"`);
  }
  if (mode === "mock" && process.env.NODE_ENV === "production" && env("BAHAD_ALLOW_MOCK") !== "1") {
    throw new Error(
      "Mock auth is disabled in production builds. Configure Supabase (NEXT_PUBLIC_SUPABASE_URL …) " +
        "or set BAHAD_ALLOW_MOCK=1 for a local test run only.",
    );
  }
  return mode;
}

export function realtimeMode(): RealtimeMode {
  const m = env("NEXT_PUBLIC_BAHAD_REALTIME") ?? (authMode() === "supabase" ? "supabase" : "sse");
  if (m !== "supabase" && m !== "sse") throw new Error(`NEXT_PUBLIC_BAHAD_REALTIME must be "supabase" or "sse"`);
  return m;
}

export function supabaseConfig() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  return { url, anonKey, serviceKey: env("SUPABASE_SERVICE_ROLE_KEY") };
}

/**
 * Direct Google sign-in (BAHAD_AUTH=google): no Supabase. Identities live in the local
 * auth.users table (supabase/local/00_auth_shim.sql) and sessions in a signed cookie.
 */
export function googleConfig() {
  const clientId = env("GOOGLE_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET");
  const sessionSecret = env("BAHAD_SESSION_SECRET");
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required when BAHAD_AUTH=google");
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error("BAHAD_SESSION_SECRET (at least 32 characters, e.g. `openssl rand -hex 32`) is required when BAHAD_AUTH=google");
  }
  return { clientId, clientSecret, sessionSecret, siteUrl: env("NEXT_PUBLIC_SITE_URL")?.replace(/\/$/, "") };
}

/** Username + password sign-in next to Google. Only with our own identity table (BAHAD_AUTH=google); BAHAD_PASSWORD_LOGIN=0 turns it off. */
export function passwordLoginEnabled(): boolean {
  return authMode() === "google" && env("BAHAD_PASSWORD_LOGIN") !== "0";
}

export function databaseUrl(): string | undefined {
  return env("DATABASE_URL");
}

export function pgliteDir(): string {
  return env("BAHAD_PGLITE_DIR") ?? ".data/pglite";
}

/** Emails that become admin + approved automatically on first sign-in (bootstrap). */
export function adminEmails(): string[] {
  return (env("BAHAD_ADMIN_EMAILS") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Q3 in the plan: may commanders approve new users from their own company? */
/** Default: new users wait for an admin to approve them after registering. 0 = open registration (straight in). */
export function requireApproval(): boolean {
  return env("BAHAD_REQUIRE_APPROVAL") !== "0";
}

export function commandersCanApprove(): boolean {
  return env("BAHAD_COMMANDERS_CAN_APPROVE") === "1";
}

export function cronSecret(): string | undefined {
  return env("CRON_SECRET");
}

export function vapidConfig() {
  const publicKey = env("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  const subject = env("VAPID_SUBJECT");
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** Run the push sender inside the Node process every minute (self-host / local; not for Vercel). */
export function internalCron(): boolean {
  return env("BAHAD_INTERNAL_CRON") === "1";
}

/**
 * The database is NOT Supabase (plain Postgres with supabase/local/00_auth_shim.sql) while
 * sign-in still uses Supabase Auth: mirror each signed-in identity into the local auth.users.
 */
export function authShim(): boolean {
  return env("BAHAD_AUTH_SHIM") === "1";
}
