"use client";
import { CalendarClock, Search, Wind, WashingMachine } from "lucide-react";
import { KIND_LABEL, SLOT_MINUTES, WEEKLY_LIMIT, machineById, type Kind } from "./machines";
import { dayLabel, relativeFromNow, slotEnd, slotStart, weekRange } from "./time";
import { groupSlots, isShared, type Laundry, type Rec } from "./data";

function QuotaMeter({ kind, used }: { kind: Kind; used: number }) {
  const Icon = kind === "washer" ? WashingMachine : Wind;
  const full = used >= WEEKLY_LIMIT;
  return (
    <div className="flex-1 rounded-ctl bg-surface-2 p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          <Icon className="size-4 text-muted" aria-hidden="true" />
          {KIND_LABEL[kind].many}
        </span>
        <span className={`font-bold tabular-nums ${full ? "text-warning" : ""}`}>
          {used}/{WEEKLY_LIMIT}
        </span>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {Array.from({ length: WEEKLY_LIMIT }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < used ? (full ? "bg-warning" : "bg-accent") : "bg-surface-3"}`} />
        ))}
      </div>
    </div>
  );
}

export function MyBookings({
  data,
  today,
  now,
  onOpen,
  onFind,
}: {
  data: Laundry;
  today: string;
  now: Date;
  onOpen: (r: Rec) => void;
  onFind: () => void;
}) {
  if (!data.mine) return <div className="skeleton h-64" aria-busy="true" />;
  const [from, to] = weekRange(today);
  const nextWeekDay = new Date(Date.parse(to) + 86400_000).toISOString().slice(0, 10);
  const sorted = [...data.mine].sort((a, b) => (a.data.day + a.data.time).localeCompare(b.data.day + b.data.time));
  const upcoming = sorted.filter((r) => slotStart(r.data.day, r.data.time).getTime() + SLOT_MINUTES * 60_000 > now.getTime());
  const hasNextWeek = upcoming.some((r) => r.data.day > to);
  /** Who shares my slot with me, if anyone (from the days the calendar loaded). */
  const partner = (r: Rec) => groupSlots(data.byDay[r.data.day]).get(`${r.data.machine}|${r.data.time}`)?.find((x) => !x.mine)?.owner.name;

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="text-base font-bold">המכסה השבוע</h2>
        <p className="text-xs text-muted">
          א&apos; {Number(from.slice(8))}.{Number(from.slice(5, 7))} – ש&apos; {Number(to.slice(8))}.{Number(to.slice(5, 7))} · מתאפסת ביום ראשון
        </p>
        <div className="mt-3 flex gap-2">
          <QuotaMeter kind="washer" used={data.usedInWeek(today, "washer")} />
          <QuotaMeter kind="dryer" used={data.usedInWeek(today, "dryer")} />
        </div>
        {hasNextWeek ? (
          <>
            <p className="mt-4 text-xs font-semibold text-muted">שבוע הבא</p>
            <div className="mt-2 flex gap-2">
              <QuotaMeter kind="washer" used={data.usedInWeek(nextWeekDay, "washer")} />
              <QuotaMeter kind="dryer" used={data.usedInWeek(nextWeekDay, "dryer")} />
            </div>
          </>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 px-1 text-base font-bold">השריונים הקרובים</h2>
        {upcoming.length === 0 ? (
          <div className="card flex flex-col items-center py-8 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
              <CalendarClock className="size-7" aria-hidden="true" />
            </span>
            <p className="mt-3 font-bold">אין לך שריונים קרובים</p>
            <button type="button" className="btn mt-4" onClick={onFind}>
              <Search className="size-4" aria-hidden="true" /> מציאת משבצת פנויה
            </button>
          </div>
        ) : (
          <ul className="list-group">
            {upcoming.map((r) => {
              const m = machineById(r.data.machine)!;
              const Icon = m.kind === "washer" ? WashingMachine : Wind;
              const start = slotStart(r.data.day, r.data.time);
              const live = start.getTime() <= now.getTime();
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => onOpen(r)} className="list-row w-full text-start hover:bg-surface-2" data-testid="my-booking">
                    <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${live ? "bg-accent text-accent-contrast" : "bg-accent-soft text-accent"}`}>
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{m.label}</span>
                      <span className="block text-sm text-muted">
                        {dayLabel(r.data.day, today)} · <span className="tabular-nums" dir="ltr">{r.data.time}–{slotEnd(r.data.time)}</span>
                      </span>
                      <span className="block text-xs text-muted">
                        {isShared(r) ? (partner(r) ? `בחלוקה עם ${partner(r)}` : "בחלוקה — מקום לעוד אחד") : "כל המכונה"}
                      </span>
                    </span>
                    <span className={live ? "badge-accent" : "badge-hidden"}>{live ? "עכשיו" : relativeFromNow(start, now)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
