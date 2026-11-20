"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Wind, WashingMachine, Wrench } from "lucide-react";
import { MACHINES, SLOTS, SLOT_MINUTES, type Kind, type Machine } from "./machines";
import { addDays, israelDay, monthGrid, monthLabel, slotEnd, slotStart, weekDays } from "./time";
import type { Laundry, Rec } from "./data";

const ROW = 52; // px per 40-minute row (≥ 44px tap target)

export function KindSwitch({ kind, onChange }: { kind: Kind; onChange: (k: Kind) => void }) {
  const opts: { k: Kind; label: string; Icon: typeof Wind; n: number }[] = [
    { k: "washer", label: "כביסה", Icon: WashingMachine, n: MACHINES.filter((m) => m.kind === "washer").length },
    { k: "dryer", label: "ייבוש", Icon: Wind, n: MACHINES.filter((m) => m.kind === "dryer").length },
  ];
  return (
    <div role="radiogroup" aria-label="סוג מכונה" className="grid grid-cols-2 gap-1 rounded-ctl bg-surface-2 p-1">
      {opts.map(({ k, label, Icon, n }) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={kind === k}
          onClick={() => onChange(k)}
          className={`flex min-h-10 items-center justify-center gap-2 rounded-[9px] text-sm font-semibold transition-all ${
            kind === k ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-muted hover:text-fg"
          }`}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
          <span className="text-xs font-medium text-subtle">({n})</span>
        </button>
      ))}
    </div>
  );
}

const WEEKDAY = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

/** Google-Calendar-like header: month title, ‹ › week arrows, "היום", month picker, week strip. */
export function WeekNav({
  day,
  today,
  horizon,
  onChange,
  marked,
  onOpenMonth,
}: {
  day: string;
  today: string;
  horizon: string;
  onChange: (d: string) => void;
  marked: Set<string>;
  onOpenMonth: () => void;
}) {
  const week = weekDays(day);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1">
        <button type="button" onClick={onOpenMonth} className="btn-ghost -ms-2 gap-1.5 px-2 text-lg font-extrabold" aria-label={`בחירת תאריך — ${monthLabel(day)}`}>
          {monthLabel(day)}
          <CalendarDays className="size-[18px] text-muted" aria-hidden="true" />
        </button>
        <span className="flex-1" />
        <button type="button" className="btn-secondary min-h-9 px-3 text-sm" onClick={() => onChange(today)} disabled={day === today}>
          היום
        </button>
        <button type="button" className="icon-btn" aria-label="השבוע הקודם" onClick={() => onChange(addDays(day, -7))}>
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn" aria-label="השבוע הבא" onClick={() => onChange(addDays(day, 7))}>
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1" role="group" aria-label="בחירת יום">
        {week.map((d, i) => {
          const active = d === day;
          const isToday = d === today;
          const outside = d < today || d > horizon;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={active}
              aria-label={`${WEEKDAY[i]} ${Number(d.slice(8))}.${Number(d.slice(5, 7))}${isToday ? " (היום)" : ""}`}
              onClick={() => onChange(d)}
              className={`relative flex flex-col items-center rounded-2xl py-1.5 transition-all ${
                active ? "bg-fg text-bg shadow-[var(--shadow)]" : "hover:bg-surface-2"
              } ${outside && !active ? "opacity-45" : ""}`}
            >
              <span className={`text-[11px] font-semibold ${active ? "opacity-80" : "text-muted"}`}>{WEEKDAY[i]}</span>
              <span
                className={`mt-0.5 flex size-8 items-center justify-center rounded-full text-base font-extrabold tabular-nums ${
                  isToday && !active ? "bg-accent text-accent-contrast" : ""
                }`}
              >
                {Number(d.slice(8))}
              </span>
              {marked.has(d) ? <span className={`absolute bottom-1 size-1.5 rounded-full ${active ? "bg-bg" : "bg-accent"}`} aria-hidden="true" /> : <span className="h-1.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Month grid for jumping to any date (opened from the month title). */
export function MonthPicker({ day, today, horizon, marked, onPick }: { day: string; today: string; horizon: string; marked: Set<string>; onPick: (d: string) => void }) {
  const [month, setMonth] = useState(day.slice(0, 8) + "01");
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(t.toISOString().slice(0, 10));
  };
  return (
    <div>
      <div className="flex items-center justify-between">
        <button type="button" className="icon-btn" aria-label="החודש הקודם" onClick={() => shift(-1)}>
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
        <span className="font-extrabold">{monthLabel(month)}</span>
        <button type="button" className="icon-btn" aria-label="החודש הבא" onClick={() => shift(1)}>
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-semibold text-muted">
        {WEEKDAY.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {monthGrid(month)
          .flat()
          .map((d, i) =>
            d ? (
              <button
                key={d}
                type="button"
                onClick={() => onPick(d)}
                aria-label={`${Number(d.slice(8))}.${Number(d.slice(5, 7))}`}
                aria-pressed={d === day}
                className={`relative mx-auto flex size-10 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-colors ${
                  d === day ? "bg-fg text-bg" : d === today ? "bg-accent text-accent-contrast" : "hover:bg-surface-2"
                } ${(d < today || d > horizon) && d !== day ? "text-subtle" : ""}`}
              >
                {Number(d.slice(8))}
                {marked.has(d) ? <span className="absolute bottom-1 size-1 rounded-full bg-accent" aria-hidden="true" /> : null}
              </button>
            ) : (
              <span key={`e${i}`} />
            ),
          )}
      </div>
      <p className="mt-3 text-center text-xs text-muted">ניתן לשריין מהיום ועד {Number(horizon.slice(8))}.{Number(horizon.slice(5, 7))} (4 שבועות)</p>
    </div>
  );
}

export function Legend() {
  const item = (cls: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className={`size-3.5 rounded-[5px] ${cls}`} aria-hidden="true" />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {item("border border-dashed border-line-strong bg-surface", "פנוי")}
      {item("bg-accent", "שלי")}
      {item("bg-surface-3", "תפוס")}
      {item("bg-[repeating-linear-gradient(135deg,var(--surface-2)_0_4px,var(--surface-3)_4px_8px)]", "עבר / תקולה")}
    </div>
  );
}

export function CalendarGrid({
  data,
  day,
  kind,
  now,
  bookable,
  onFree,
  onBooked,
  onMachine,
}: {
  data: Laundry;
  day: string;
  kind: Kind;
  now: Date;
  /** false outside the booking window (before today / more than 4 weeks ahead) */
  bookable: boolean;
  onFree: (m: Machine, time: string) => void;
  onBooked: (r: Rec) => void;
  onMachine: (m: Machine) => void;
}) {
  const machines = MACHINES.filter((m) => m.kind === kind);
  const list = data.byDay[day];
  const map = useMemo(() => new Map((list ?? []).map((r) => [`${r.data.machine}|${r.data.time}`, r])), [list]);
  const isToday = day === israelDay(now);
  const nowRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);

  // On today, bring the current time into view once per day/kind.
  useEffect(() => {
    if (!list || !isToday || scrolledFor.current === `${day}|${kind}`) return;
    scrolledFor.current = `${day}|${kind}`;
    nowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [list, isToday, day, kind]);

  if (!list) return <div className="skeleton h-[480px]" aria-busy="true" aria-label="טוען את היומן" />;

  const minutesFromStart = (now.getTime() - slotStart(day, SLOTS[0]).getTime()) / 60_000;
  const nowTop = (minutesFromStart / SLOT_MINUTES) * ROW;
  const cols = { gridTemplateColumns: `52px repeat(${machines.length}, minmax(0, 1fr))` };

  return (
    <div className="rounded-card border border-line bg-surface shadow-soft">
      {/* machine header — sticks under the tab bar (64px) while scrolling the day */}
      <div className="sticky top-[64px] z-20 grid gap-1 rounded-t-card border-b border-line bg-surface/95 px-1.5 py-2 backdrop-blur" style={cols}>
        <span />
        {machines.map((m) => {
          const b = data.broken[m.id];
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onMachine(m)}
              disabled={!data.canModerate && !b}
              className={`flex min-h-10 flex-col items-center justify-center rounded-ctl px-0.5 text-center text-[12px] font-bold leading-tight ${
                b ? "bg-danger-soft text-danger" : "text-fg"
              } ${data.canModerate ? "hover:bg-surface-2" : ""}`}
              aria-label={`${m.label}${b ? " — תקולה" : ""}`}
            >
              <span className="truncate">{m.short}</span>
              <span className="text-[10px] font-medium text-muted">{b ? <Wrench className="mx-auto size-3" aria-hidden="true" /> : m.kind === "washer" ? "כביסה" : "מייבש"}</span>
            </button>
          );
        })}
      </div>

      <div className="relative px-1.5 py-1.5">
        {isToday && minutesFromStart >= 0 && minutesFromStart <= SLOTS.length * SLOT_MINUTES ? (
          <div ref={nowRef} className="pointer-events-none absolute inset-x-1.5 z-10 flex items-center" style={{ top: nowTop + 6 }} aria-hidden="true">
            <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">עכשיו</span>
            <span className="h-0.5 flex-1 bg-danger/70" />
          </div>
        ) : null}
        {SLOTS.map((time) => {
          const end = new Date(slotStart(day, time).getTime() + SLOT_MINUTES * 60_000);
          const past = end.getTime() <= now.getTime();
          const fullHour = time.endsWith(":00");
          const booker = (rec: Rec) => (rec.mine ? "שלי" : rec.owner.name);
          return (
            <div key={time} className="grid gap-1" style={{ ...cols, height: ROW }}>
              <span className={`pt-1 text-center text-[11px] tabular-nums ${fullHour ? "font-bold text-fg" : "text-subtle"}`}>{time}</span>
              {machines.map((m) => {
                const rec = map.get(`${m.id}|${time}`);
                const broken = !!data.broken[m.id];
                const base = "my-0.5 flex min-w-0 items-center justify-center rounded-[10px] px-1 text-[11px] font-semibold transition-all";
                if (rec) {
                  const own = rec.mine;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onBooked(rec)}
                      aria-label={`${m.label} ${time}–${slotEnd(time)} ${own ? "השריון שלי" : `תפוס ע"י ${booker(rec)}${rec.data.phone ? `, ${rec.data.phone}` : ""}`}`}
                      className={`${base} ${own ? "bg-accent text-accent-contrast shadow-[var(--shadow-sm)] hover:bg-accent-hover" : "bg-surface-3 text-fg"} ${past ? "opacity-50" : ""}`}
                    >
                      <span className="flex min-w-0 flex-col items-center leading-tight">
                        <span className="max-w-full truncate">{booker(rec)}</span>
                        {rec.data.phone ? (
                          <span className={`max-w-full truncate text-[10px] font-medium tabular-nums ${own ? "opacity-85" : "text-subtle"}`} dir="ltr">
                            {rec.data.phone}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                }
                if (past || broken || !bookable) {
                  return (
                    <span
                      key={m.id}
                      className={`${base} bg-[repeating-linear-gradient(135deg,var(--surface-2)_0_4px,var(--surface)_4px_8px)]`}
                      aria-hidden="true"
                    />
                  );
                }
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onFree(m, time)}
                    aria-label={`${m.label} ${time}–${slotEnd(time)} פנוי — שריון`}
                    className={`${base} group border border-dashed border-line-strong/70 text-transparent hover:border-accent hover:bg-accent-soft hover:text-accent`}
                  >
                    <span className="text-base leading-none group-hover:text-accent">+</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
