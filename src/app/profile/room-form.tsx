"use client";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { saveRoom } from "./actions";

export function RoomForm({ room: initial }: { room: string }) {
  const [state, action, pending] = useActionState(saveRoom, {});
  const [room, setRoom] = useState(initial);
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
        <label htmlFor="room" className="sr-only">
          מספר חדר
        </label>
        <input
          id="room"
          name="room"
          inputMode="numeric"
          maxLength={3}
          dir="ltr"
          placeholder="241"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          className="field text-end"
          autoComplete="off"
        />
        <button type="submit" className="btn shrink-0" disabled={pending || room === initial}>
          שמירה
        </button>
      </div>
      {state.error ? <p className="mt-2 text-sm text-danger">{state.error}</p> : null}
      {state.ok ? (
        <p className="mt-2 flex items-center gap-1 text-sm text-success">
          <Check className="size-4" aria-hidden="true" /> נשמר
        </p>
      ) : null}
      <p className="hint">עברת חדר? עדכן/י כאן — אפליקציית המגורים משתמשת בזה.</p>
    </form>
  );
}
