"use client";
import { useEffect, useMemo, useState } from "react";
import { Moon, Sun, Sunrise, Sunset, Clock, TriangleAlert, Zap } from "lucide-react";
import { BOOK_DAYS_AHEAD, KIND_LABEL, MACHINES, SLOTS, TIME_OF_DAY, WEEKLY_LIMIT, type Kind, type Machine } from "./machines";
import { addDays, dayLabel, slotEnd, slotStart } from "./time";
import { KindSwitch } from "./calendar";
import type { Laundry } from "./data";

const TOD_ICON = { any: Clock, morning: Sunrise, noon: Sun, evening: Sunset, night: Moon } as const;
type When = "today" | "tomorrow" | "week" | "month";

export interface FreeSlot {
  day: string;
  time: string;
  free: Machine[];
}

/** Free (machine, slot) options for the next days — pure, so it is easy to test. */
export function findFree(data: Pick<Laundry, "byDay" | "broken">, days: string[], kind: Kind, tod: (typeof TIME_OF_DAY)[number], now: Date): FreeSlot[] {
  const out: FreeSlot[] = [];
  const machines = MACHINES.filter((m) => m.kind === kind && !data.broken[m.id]);
  for (const day of days) {
    const taken = new Set((data.byDay[day] ?? []).map((r) => `${r.data.machine}|${r.data.time}`));
    for (const time of SLOTS) {
      const h = Number(time.slice(0, 2));
      if (h < tod.from || h >= tod.to) continue;
      if (slotStart(day, time).getTime() + 30 * 60_000 <= now.getTime()) continue;
      const free = machines.filter((m) => !taken.has(`${m.id}|${time}`));
      if (free.length) out.push({ day, time, free });
    }
  }
  return out;
}

export function Finder({
  data,
  today,
  now,
  kind,
  onKind,
  onPick,
}: {
  data: Laundry;
  today: string;
  now: Date;
  kind: Kind;
  onKind: (k: Kind) => void;
  onPick: (slot: FreeSlot) => void;
}) {
  const [when, setWhen] = useState<When>("today");
  const [todKey, setTodKey] = useState<(typeof TIME_OF_DAY)[number]["key"]>("any");
  const [limit, setLimit] = useState(30);
  const range = useMemo(() => {
    const n = when === "today" ? 1 : when === "tomorrow" ? 1 : when === "week" ? 7 : BOOK_DAYS_AHEAD + 1;
    const first = when === "tomorrow" ? addDays(today, 1) : today;
    return Array.from({ length: n }, (_, i) => addDays(first, i));
  }, [when, today]);
  const tod = TIME_OF_DAY.find((t) => t.key === todKey)!;

  useEffect(() => {
    for (const d of range) if (!data.byDay[d]) void data.loadDay(d).catch(() => {});
  }, [range, data]);

  const loading = range.some((d) => !data.byDay[d]);
  const results = useMemo(() => (loading ? [] : findFree(data, range, kind, tod, now)), [loading, data, range, kind, tod, now]);
  const fullWeeks = new Set(range.filter((d) => data.usedInWeek(d, kind) >= WEEKLY_LIMIT));
  const usable = results.filter((r) => !fullWeeks.has(r.day));

  return (
    <div className="space-y-4">
      <section className="card space-y-4">
        <KindSwitch kind={kind} onChange={onKind} />
        <div>
          <p className="section-title mb-2">מתי</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", "היום"],
                ["tomorrow", "מחר"],
                ["week", "7 ימים"],
                ["month", "4 שבועות"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" className="chip" aria-pressed={when === k} onClick={() => setWhen(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="section-title mb-2">באיזו שעה</p>
          <div className="flex flex-wrap gap-2">
            {TIME_OF_DAY.map((t) => {
              const Icon = TOD_ICON[t.key];
              return (
                <button key={t.key} type="button" className="chip" aria-pressed={todKey === t.key} onClick={() => setTodKey(t.key)}>
                  <Icon className="size-4" aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {fullWeeks.size > 0 ? (
        <p className="flex items-start gap-2 rounded-card border border-warning/30 bg-warning-soft p-3 text-sm text-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          ניצלת את {WEEKLY_LIMIT} ה{KIND_LABEL[kind].many} של השבוע — אפשר לשריין שוב מיום ראשון.
        </p>
      ) : null}

      {loading ? (
        <div className="skeleton h-48" aria-busy="true" />
      ) : usable.length === 0 ? (
        <p className="card text-center text-muted">אין משבצות פנויות בטווח הזה. נסו זמן אחר או יום אחר.</p>
      ) : (
        <ul className="space-y-2" aria-label="משבצות פנויות">
          {usable.slice(0, limit).map((r, i, arr) => {
            const header = i === 0 || arr[i - 1].day !== r.day;
            return (
              <li key={`${r.day}|${r.time}`}>
                {header ? <p className="section-title mb-1 mt-3 px-1">{dayLabel(r.day, today)}</p> : null}
                <button
                  type="button"
                  onClick={() => onPick(r)}
                  data-testid="free-slot"
                  className={`flex w-full items-center gap-3 rounded-card border bg-surface p-3 text-start shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-soft ${
                    i === 0 ? "border-accent/40 ring-1 ring-accent/20" : "border-line"
                  }`}
                >
                  <span className="flex min-w-16 flex-col items-center rounded-ctl bg-surface-2 px-2 py-1.5">
                    <span className="text-base font-extrabold tabular-nums">{r.time}</span>
                    <span className="text-[10px] text-muted tabular-nums">עד {slotEnd(r.time)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    {i === 0 ? (
                      <span className="badge-accent mb-0.5">
                        <Zap className="size-3" aria-hidden="true" /> הכי קרוב
                      </span>
                    ) : null}
                    <span className="block truncate font-semibold">
                      {r.free.length === 1 ? r.free[0].label : `${r.free.length} מכונות פנויות`}
                    </span>
                    <span className="block truncate text-xs text-muted">מס׳ {r.free.map((m) => m.label.split(" ")[1]).join(" · ")}</span>
                  </span>
                  <span className="btn min-h-9 px-3 text-sm">שריון</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {usable.length > limit ? (
        <button type="button" className="btn-secondary w-full" onClick={() => setLimit((l) => l + 30)}>
          עוד משבצות
        </button>
      ) : null}
    </div>
  );
}
