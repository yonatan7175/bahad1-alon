"use client";
import { useState, useTransition } from "react";
import { savePrivacy } from "./actions";
import { useToast } from "@/components/toast";

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-surface-3 transition-colors peer-checked:bg-accent peer-focus-visible:shadow-[var(--ring)]" aria-hidden="true" />
        <span className="absolute start-1 top-1 size-5 rounded-full bg-white shadow transition-transform peer-checked:-translate-x-5" aria-hidden="true" />
      </span>
    </label>
  );
}

export function PrivacyToggles({ showPhone, showEmail, hasPhone }: { showPhone: boolean; showEmail: boolean; hasPhone: boolean }) {
  const toast = useToast();
  const [phone, setPhone] = useState(showPhone);
  const [email, setEmail] = useState(showEmail);
  const [pending, start] = useTransition();
  const save = (field: "show_phone" | "show_email", v: boolean, set: (x: boolean) => void) => {
    set(v);
    start(async () => {
      const r = await savePrivacy(field, v);
      if (r.error) {
        set(!v);
        toast(r.error, "error");
      } else toast(v ? "מוצג לכולם בספר הטלפונים" : "מוסתר מספר הטלפונים");
    });
  };
  return (
    <div className="divide-y divide-line">
      <Toggle
        label="הצגת הטלפון שלי"
        hint={hasPhone ? "כל המשתמשים המאושרים יראו אותו בדף האנשים" : "לא הוזן טלפון"}
        checked={phone}
        disabled={pending}
        onChange={(v) => save("show_phone", v, setPhone)}
      />
      <Toggle label="הצגת האימייל שלי" hint="כל המשתמשים המאושרים יראו אותו בדף האנשים" checked={email} disabled={pending} onChange={(v) => save("show_email", v, setEmail)} />
    </div>
  );
}
