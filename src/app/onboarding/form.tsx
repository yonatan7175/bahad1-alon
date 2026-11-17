"use client";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { MAX_TEAM } from "@/lib/validate";
import { saveOnboarding, type OnboardingState } from "./actions";

interface Unit {
  id: string;
  name: string;
}

// Controlled inputs: React resets uncontrolled forms after a server action, which
// would wipe what the user typed whenever validation fails.
export function OnboardingForm({
  companies,
  initial,
}: {
  companies: Unit[];
  initial: { name: string; room: string; company: string; team: string; phone: string };
}) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(saveOnboarding, {});
  // Submit through a transition instead of <form action>: React resets a form after an
  // action, which would wipe what the user typed when validation fails.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
  const [name, setName] = useState(initial.name);
  const [room, setRoom] = useState(initial.room);
  const [company, setCompany] = useState(initial.company);
  const [team, setTeam] = useState(initial.team);
  const [phone, setPhone] = useState(initial.phone);
  return (
    <form onSubmit={submit} className="mt-5">
      <label className="label mt-0" htmlFor="name">
        שם מלא בעברית
      </label>
      <input id="name" name="name" required minLength={2} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className="field" autoComplete="name" />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="company">
            פלוגה
          </label>
          <select id="company" name="company" required value={company} onChange={(e) => setCompany(e.target.value)} className="field">
            <option value="" disabled>
              בחרו פלוגה
            </option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="team">
            מספר צוות
          </label>
          <input
            id="team"
            name="team"
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={MAX_TEAM}
            step={1}
            dir="ltr"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="field text-end"
          />
        </div>
      </div>

      <label className="label" htmlFor="room">
        מספר חדר
      </label>
      <input
        id="room"
        name="room"
        required
        maxLength={8}
        dir="ltr"
        placeholder="214"
        value={room}
        onChange={(e) => setRoom(e.target.value)}
        className="field text-end"
        autoComplete="off"
      />

      <label className="label" htmlFor="phone">
        טלפון נייד
      </label>
      <input
        id="phone"
        name="phone"
        type="tel"
        inputMode="tel"
        required
        dir="ltr"
        placeholder="050-1234567"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="field text-end"
        autoComplete="tel"
      />

      {state.error ? (
        <p role="alert" className="mt-4 rounded-ctl bg-danger-soft p-3 text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn mt-6 h-12 w-full" disabled={pending}>
        {pending ? "שומר…" : "שליחה לאישור"}
      </button>
    </form>
  );
}
