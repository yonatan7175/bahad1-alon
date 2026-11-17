"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const BUTTON_CLASS =
  "flex min-h-13 w-full items-center justify-center gap-3 rounded-ctl border border-line-strong bg-white px-4 text-[15px] font-semibold text-[#1f1f1f] shadow-[var(--shadow-sm)] transition-[box-shadow,background-color] hover:bg-[#f8faf8] hover:shadow-[var(--shadow)] disabled:opacity-60";

/** direct = BAHAD_AUTH=google: a plain link to the server-side flow (no Supabase in the browser). */
export function GoogleSignInButton({ next, direct = false }: { next: string; direct?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (direct) {
    return (
      <a
        href={`/auth/google/start?next=${encodeURIComponent(next)}`}
        className={BUTTON_CLASS}
        aria-busy={busy}
        onClick={() => setBusy(true)}
      >
        <GoogleLogo />
        {busy ? "מעביר ל-Google…" : "התחברות עם Google"}
      </a>
    );
  }
  return (
    <>
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
          const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
              scopes: "openid email profile",
              queryParams: { prompt: "select_account" },
            },
          });
          if (error) {
            setError("לא הצלחנו להתחיל את ההתחברות. נסו שוב.");
            setBusy(false);
          }
        }}
      >
        <GoogleLogo />
        {busy ? "מעביר ל-Google…" : "התחברות עם Google"}
      </button>
      {error ? <p className="mt-2 text-center text-sm text-danger">{error}</p> : null}
    </>
  );
}

function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}
