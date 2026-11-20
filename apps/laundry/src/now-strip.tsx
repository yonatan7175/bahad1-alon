"use client";
// "עכשיו" — one glance at every machine: free now (book in one tap), busy until when, or broken.
import { CircleCheck, CircleDot, Wrench } from "lucide-react";
import { MACHINES, SLOTS, SLOT_MINUTES, type Machine } from "./machines";
import { slotEnd, slotStart } from "./time";
import type { Laundry } from "./data";

export function NowStrip({ data, today, now, onBook }: { data: Laundry; today: string; now: Date; onBook: (m: Machine, time: string) => void }) {
  const list = data.byDay[today];
  if (!list) return null;
  const t = now.getTime();
  const current = SLOTS.find((s) => {
    const st = slotStart(today, s).getTime();
    return st <= t && t < st + SLOT_MINUTES * 60_000;
  });
  const upcoming = SLOTS.filter((s) => slotStart(today, s).getTime() > t);
  const taken = (m: Machine, time: string) => list.find((r) => r.data.machine === m.id && r.data.time === time);

  return (
    <section aria-label="מצב המכונות עכשיו" className="grid grid-cols-3 gap-2">
      {MACHINES.map((m) => {
        const broken = data.broken[m.id];
        const busy = current ? taken(m, current) : undefined;
        const nextFree = upcoming.find((s) => !taken(m, s));
        let tone = "border-success/35 bg-success-soft text-success";
        let Icon = CircleCheck;
        let line: string;
        let action: (() => void) | null = null;
        if (broken) {
          tone = "border-danger/35 bg-danger-soft text-danger";
          Icon = Wrench;
          line = "תקולה";
        } else if (busy) {
          tone = "border-warning/35 bg-warning-soft text-warning";
          Icon = CircleDot;
          line = `תפוסה עד ${slotEnd(current!)}`;
          if (nextFree) action = () => onBook(m, nextFree);
        } else if (current) {
          line = "פנויה עכשיו";
          action = () => onBook(m, current);
        } else {
          tone = "border-line bg-surface-2 text-muted";
          line = nextFree ? `פנויה מ-${nextFree}` : "סגור להיום";
          if (nextFree) action = () => onBook(m, nextFree);
        }
        return (
          <button
            key={m.id}
            type="button"
            disabled={!action}
            onClick={action ?? undefined}
            className={`flex min-h-[76px] flex-col items-start justify-between rounded-card border p-2.5 text-start shadow-[var(--shadow-sm)] transition-transform enabled:active:scale-[0.97] ${tone}`}
          >
            <span className="flex w-full items-center justify-between gap-1 text-[12px] font-bold text-fg">
              {m.short}
              <Icon className="size-4 shrink-0" aria-hidden="true" />
            </span>
            <span className="text-[13px] font-extrabold leading-tight">{line}</span>
            {action ? <span className="text-[10px] font-semibold opacity-80">{busy && nextFree ? `הבאה: ${nextFree} · שריון` : "לחצו לשריון"}</span> : null}
          </button>
        );
      })}
    </section>
  );
}
