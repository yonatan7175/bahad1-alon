"use client";
import { useState, useTransition } from "react";
import { answerConsent } from "./actions";

export function ConsentButtons({ params }: { params: Record<string, string> }) {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = (allow: boolean) => {
    setWhich(allow ? "allow" : "deny");
    setError(null);
    start(async () => {
      const r = await answerConsent(params, allow);
      if (r.url) window.location.assign(r.url);
      else {
        setError(r.error ?? "משהו השתבש. נסו שוב.");
        setWhich(null);
      }
    });
  };
  return (
    <div className="mt-6">
      {error ? (
        <p role="alert" className="mb-3 rounded-ctl bg-danger-soft p-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <button type="button" className="btn h-12 w-full" disabled={pending} onClick={() => go(true)}>
        {pending && which === "allow" ? "מתחבר…" : "אישור והמשך"}
      </button>
      <button type="button" className="btn-ghost mt-2 min-h-11 w-full" disabled={pending} onClick={() => go(false)}>
        ביטול
      </button>
    </div>
  );
}
