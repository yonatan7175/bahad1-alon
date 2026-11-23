"use client";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { savePassword } from "./actions";

export function PasswordChangeForm() {
  const [state, action, pending] = useActionState(savePassword, {});
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
  return (
    <form onSubmit={submit}>
      <label className="label mt-0" htmlFor="pw-current">
        סיסמה נוכחית
      </label>
      <input id="pw-current" name="current" type="password" required maxLength={128} dir="ltr" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="field" />
      <label className="label" htmlFor="pw-new">
        סיסמה חדשה
      </label>
      <input id="pw-new" name="password" type="password" required minLength={8} maxLength={128} dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field" />
      <label className="label" htmlFor="pw-confirm">
        אימות סיסמה חדשה
      </label>
      <input id="pw-confirm" name="confirm" type="password" required maxLength={128} dir="ltr" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="field" />
      <p className="hint">לפחות 8 תווים, אותיות וספרות. לא הסיסמה של צה&quot;ל.</p>
      {state.error ? <p className="mt-2 text-sm text-danger">{state.error}</p> : null}
      {state.ok ? (
        <p className="mt-2 flex items-center gap-1 text-sm text-success">
          <Check className="size-4" aria-hidden="true" /> הסיסמה הוחלפה
        </p>
      ) : null}
      <button type="submit" className="btn mt-3" disabled={pending || !current || !password}>
        החלפת סיסמה
      </button>
    </form>
  );
}
