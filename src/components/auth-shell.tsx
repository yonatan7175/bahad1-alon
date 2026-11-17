import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { OakMark, SchoolBadge } from "./brand";
import { SITE_NAME } from "@/lib/site";

/** Layout for sign-in / onboarding / pending / blocked: brand hero band + floating card. */
export function AuthShell({ children, step }: { children: ReactNode; step?: 1 | 2 | 3 }) {
  return (
    <main className="relative flex-1">
      <div className="hero absolute inset-x-0 top-0 h-72 sm:h-80" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-md px-4 pb-10 pt-10 sm:pt-14">
        <div className="mb-6 flex flex-col items-center text-center text-[var(--hero-text)]">
          <OakMark size={64} className="ring-4 ring-white/15" />
          <p className="mt-3 text-lg font-extrabold">{SITE_NAME.split(" — ")[0]}</p>
          <SchoolBadge className="mt-2" />
        </div>
        {step ? <Stepper step={step} /> : null}
        <div className="card animate-rise p-6 shadow-lift sm:p-7">{children}</div>
      </div>
    </main>
  );
}

const STEPS = ["התחברות", "פרטים", "אישור"];

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="mb-4 flex items-center justify-center gap-2 text-[var(--hero-text)]" aria-label="שלבי ההרשמה">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <li key={label} className="flex items-center gap-2" aria-current={current ? "step" : undefined}>
            <span
              className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${
                done ? "bg-white text-accent" : current ? "bg-white/25 ring-2 ring-white" : "bg-white/10 opacity-70"
              }`}
            >
              {done ? <Check className="size-4" aria-hidden="true" /> : n}
            </span>
            <span className={`text-sm ${current ? "font-bold" : "opacity-75"}`}>{label}</span>
            {n < STEPS.length ? <span className="mx-1 h-px w-6 bg-white/30" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
