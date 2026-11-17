"use client";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { savePhone } from "./actions";

export function PhoneForm({ phone: initial }: { phone: string }) {
  const [state, action, pending] = useActionState(savePhone, {});
  const [phone, setPhone] = useState(initial);
  // Submit through a transition instead of <form action>: React resets a form after an
  // action, which would wipe what the user typed when validation fails.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
  return (
    <form onSubmit={submit}>
      <div className="flex gap-2">
        <label htmlFor="phone" className="sr-only">
          טלפון נייד
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          placeholder="050-1234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="field text-end"
        />
        <button type="submit" className="btn shrink-0" disabled={pending || phone === initial}>
          שמירה
        </button>
      </div>
      {state.error ? <p className="mt-2 text-sm text-danger">{state.error}</p> : null}
      {state.ok ? (
        <p className="mt-2 flex items-center gap-1 text-sm text-success">
          <Check className="size-4" aria-hidden="true" /> נשמר
        </p>
      ) : null}
      <p className="hint">לא חובה. אפליקציות רואות אותו רק באישור מיוחד.</p>
    </form>
  );
}
