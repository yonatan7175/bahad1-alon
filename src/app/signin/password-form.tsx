"use client";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import Link from "next/link";
import { KeyRound, ShieldAlert, UserPlus } from "lucide-react";
import { passwordRegister, passwordSignIn, type PasswordState } from "./password-actions";

/** Sign in / create an account with a username and password (next to the Google button). */
export function PasswordForm({ next, initialMode = "signin" }: { next: string; initialMode?: "signin" | "register" }) {
  const [mode, setMode] = useState<"signin" | "register">(initialMode);
  const [signInState, signIn, signingIn] = useActionState<PasswordState, FormData>(passwordSignIn, {});
  const [registerState, register, registering] = useActionState<PasswordState, FormData>(passwordRegister, {});
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const isRegister = mode === "register";
  const state = isRegister ? registerState : signInState;
  const pending = isRegister ? registering : signingIn;
  // Submit through a transition instead of <form action>: React resets a form after an
  // action, which would wipe what the user typed when the password is wrong.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => (isRegister ? register(data) : signIn(data)));
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-1 rounded-ctl bg-surface-2 p-1" role="tablist" aria-label="שם משתמש וסיסמה">
        {(
          [
            ["signin", "כניסה", KeyRound],
            ["register", "משתמש חדש", UserPlus],
          ] as const
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setConfirm("");
            }}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-ctl text-sm font-semibold transition-colors ${
              mode === m ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-muted hover:text-fg"
            }`}
          >
            <Icon className="size-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {isRegister ? (
        <p className="mt-3 flex items-start gap-2 rounded-ctl border border-[var(--brand-red)]/25 bg-danger-soft/60 px-3 py-2.5 text-[13px] leading-relaxed text-fg">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[var(--brand-red)]" aria-hidden="true" />
          <span>
            <b>בעלי סיווג 1</b> נרשמים רק כאן, ובשלב הבא ממלאים <b>שם פרטי בלבד</b>.{" "}
            <Link href="/kabam" className="font-semibold text-accent underline-offset-4 hover:underline">
              דבר הקב״מית
            </Link>
          </span>
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-3" data-testid={isRegister ? "password-register" : "password-signin"}>
        <input type="hidden" name="next" value={next} />
        <label className="label mt-0" htmlFor="pw-username">
          שם משתמש
        </label>
        <input
          id="pw-username"
          name="username"
          required
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,19}"
          title="3–20 תווים: אותיות באנגלית, ספרות, נקודה, מקף או קו תחתון"
          dir="ltr"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="field"
        />
        {isRegister ? <p className="hint">אותיות באנגלית, ספרות, נקודה, מקף או קו תחתון (3–20 תווים).</p> : null}

        <label className="label" htmlFor="pw-password">
          סיסמה
        </label>
        <input
          id="pw-password"
          name="password"
          type="password"
          required
          minLength={isRegister ? 8 : 1}
          maxLength={128}
          dir="ltr"
          autoComplete={isRegister ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
        />

        {isRegister ? (
          <>
            <p className="hint">לפחות 8 תווים, אותיות וספרות. סיסמה חדשה — לא הסיסמה של צה&quot;ל ולא של חשבון אחר.</p>
            <label className="label" htmlFor="pw-confirm">
              אימות סיסמה
            </label>
            <input
              id="pw-confirm"
              name="confirm"
              type="password"
              required
              maxLength={128}
              dir="ltr"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="field"
            />
          </>
        ) : null}

        {state.error ? (
          <p role="alert" className="mt-3 rounded-ctl bg-danger-soft p-3 text-sm font-medium text-danger">
            {state.error}
          </p>
        ) : null}
        <button type="submit" className="btn mt-4 h-12 w-full" disabled={pending}>
          {pending ? (isRegister ? "יוצר משתמש…" : "נכנס…") : isRegister ? "יצירת משתמש והמשך להרשמה" : "כניסה"}
        </button>
      </form>
    </div>
  );
}
