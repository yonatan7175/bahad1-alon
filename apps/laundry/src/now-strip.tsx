"use client";
// "עכשיו" — one glance at each machine: free now (book in one tap), shared with room for one more, busy until when, or broken.
import { CircleCheck, CircleDot, Users, Wrench } from "lucide-react";
import { MACHINES, SLOTS, SLOT_MINUTES, type Machine } from "./machines";
import { slotEnd, slotStart } from "./time";
import { groupSlots, slotState, type Laundry } from "./data";

export function NowStrip({
  data,
  today,
  now,
  onBook,
  onFree,
}: {
  data: Laundry;
  today: string;
  now: Date;
  /** A slot that already has a booking (join it / see it). */
  onBook: (m: Machine, time: string) => void;
  /** A free slot. */
  onFree: (m: Machine, time: string) => void;
}) {
  const list = data.byDay[today];
  if (!list) return null;
  const slots = groupSlots(list);
  const t = now.getTime();
  const current = SLOTS.find((s) => {
    const st = slotStart(today, s).getTime();
    return st <= t && t < st + SLOT_MINUTES * 60_000;
  });
  const upcoming = SLOTS.filter((s) => slotStart(today, s).getTime() > t);
  const state = (m: Machine, time: string) => slotState(slots.get(`${m.id}|${time}`));
  /** The next slot I could still get into (free, or shared with a seat left). */
  const open = (m: Machine, time: string) => {
    const st = state(m, time);
    return !st.mine && st.left > 0;
  };

  return (
    <section aria-label="מצב המכונות עכשיו" className="grid grid-cols-2 gap-2">
      {MACHINES.map((m) => {
        const broken = data.broken[m.id];
        const cur = current ? state(m, current) : undefined;
        const next = upcoming.find((s) => open(m, s));
        const go = (time: string) => () => (state(m, time).recs.length ? onBook(m, time) : onFree(m, time));
        let tone = "border-success/35 bg-success-soft text-success";
        let Icon = CircleCheck;
        let line: string;
        let hint = "לחצו לשריון";
        let action: (() => void) | null = null;
        if (broken) {
          tone = "border-danger/35 bg-danger-soft text-danger";
          Icon = Wrench;
          line = "תקולה";
        } else if (cur && cur.recs.length && (cur.left === 0 || cur.mine)) {
          tone = "border-warning/35 bg-warning-soft text-warning";
          Icon = CircleDot;
          line = cur.mine ? `שלך עד ${slotEnd(current!)}` : `תפוסה עד ${slotEnd(current!)}`;
          if (cur.mine) {
            action = () => onBook(m, current!);
            hint = "פרטי השריון";
          } else if (next) {
            action = go(next);
            hint = `הבאה: ${next} · שריון`;
          }
        } else if (cur && cur.recs.length) {
          // someone shares the current slot and there's a seat left
          Icon = Users;
          line = "מקום לעוד אחד עכשיו";
          action = () => onBook(m, current!);
          hint = `בחלוקה עם ${cur.recs[0].owner.name}`;
        } else if (current) {
          line = "פנויה עכשיו";
          action = () => onFree(m, current);
        } else {
          tone = "border-line bg-surface-2 text-muted";
          line = next ? `פנויה מ-${next}` : "סגור להיום";
          if (next) action = go(next);
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
              {m.label}
              <Icon className="size-4 shrink-0" aria-hidden="true" />
            </span>
            <span className="text-[13px] font-extrabold leading-tight">{line}</span>
            {action ? <span className="truncate text-[10px] font-semibold opacity-80">{hint}</span> : null}
          </button>
        );
      })}
    </section>
  );
}
