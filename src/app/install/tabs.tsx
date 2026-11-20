"use client";
// iPhone / Android switch — preselected from the phone's user agent.
import { useEffect, useState, type ReactNode } from "react";
import { Smartphone } from "lucide-react";

export function InstallTabs({ iphone, android }: { iphone: ReactNode; android: ReactNode }) {
  const [os, setOs] = useState<"iphone" | "android">("iphone");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the device is only known on the client
    if (/android/i.test(navigator.userAgent)) setOs("android");
  }, []);
  return (
    <section className="card p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-1 rounded-card bg-surface-2 p-1" role="tablist" aria-label="סוג הטלפון">
        {(
          [
            ["iphone", "אייפון"],
            ["android", "אנדרואיד"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={os === k}
            onClick={() => setOs(k)}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-ctl text-sm font-bold transition-all ${os === k ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-muted"}`}
          >
            <Smartphone className="size-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      <div className="mt-5" role="tabpanel">
        {os === "iphone" ? iphone : android}
      </div>
    </section>
  );
}
