"use client";
// לו"ז מכונות כביסה v3 — calendar of 40-minute slots: washers on floors 1 and 3, one dryer.
// Every booked slot shows who booked it and their phone.
// Tabs: יומן (calendar) · שלי (my bookings + weekly quota) · חיפוש (find a free slot).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, CalendarDays, Eye, ListChecks, MessageCircle, Phone, Search, Trash2, Wrench } from "lucide-react";
import { useBahad } from "@/platform/client";
import { BOOK_DAYS_AHEAD, KIND_LABEL, MACHINES, REMINDER_MINUTES, SLOT_MINUTES, WEEKLY_LIMIT, machineById, type Kind, type Machine } from "./machines";
import { addDays, dayLabel, israelDay, slotEnd } from "./time";
import { useLaundry, type Rec } from "./data";
import { CalendarGrid, KindSwitch, Legend, MonthPicker, WeekNav, type View } from "./calendar";
import { PersonCard } from "./person-card";
import { MyBookings } from "./mine";
import { Finder, type FreeSlot } from "./finder";
import { Detail, Sheet } from "./sheet";
import { NowStrip } from "./now-strip";

type Tab = "calendar" | "mine" | "find";
type SheetState =
  | { type: "book"; day: string; time: string; choices: Machine[]; machine: Machine }
  | { type: "booking"; rec: Rec }
  | { type: "machine"; machine: Machine }
  | { type: "month" }
  | null;

export function LaundryApp() {
  const bahad = useBahad();
  const data = useLaundry();
  const [now, setNow] = useState(() => new Date());
  const today = israelDay(now);
  const horizon = addDays(today, BOOK_DAYS_AHEAD);
  const [tab, setTab] = useState<Tab>("calendar");
  const [day, setDay] = useState(today);
  const [kind, setKind] = useState<Kind>("washer");
  /** The calendar shows all three machines by default; "כביסה"/"ייבוש" narrow it. */
  const [view, setView] = useState<View>("all");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Opened from a reminder: /a/laundry?day=YYYY-MM-DD&kind=dryer
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const d = q.get("day");
    const k = q.get("kind");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once on mount
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDay(d);
    if (k === "washer" || k === "dryer") {
      setKind(k);
      setView(k);
    }
  }, []);

  const { loadDay } = data;
  useEffect(() => {
    void loadDay(day).catch(() => bahad.ui.toast("לא הצלחנו לטעון את היומן"));
  }, [day, loadDay, bahad]);

  useEffect(() => {
    bahad.ui.setTitle(tab === "calendar" ? `כביסה · ${dayLabel(day, today)}` : tab === "mine" ? "השריונים שלי" : "חיפוש משבצת פנויה");
  }, [bahad, tab, day, today]);

  const marked = useMemo(() => new Set((data.mine ?? []).map((r) => r.data.day)), [data.mine]);
  const bookable = day >= today && day <= horizon;

  // Swipe the grid sideways to move a day (RTL: finger to the right = next day).
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) setDay((d) => addDays(d, dx > 0 ? 1 : -1));
  };
  const close = useCallback(() => setSheet(null), []);

  const openFree = (m: Machine, time: string) => setSheet({ type: "book", day, time, choices: [m], machine: m });
  const openPick = (s: FreeSlot) => setSheet({ type: "book", day: s.day, time: s.time, choices: s.free, machine: s.free[0] });

  const confirmBook = async () => {
    if (sheet?.type !== "book") return;
    setBusy(true);
    const ok = await data.book(sheet.machine, sheet.day, sheet.time);
    setBusy(false);
    if (ok) setSheet(null);
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-10 pt-4">
      {/* tabs */}
      <nav className="sticky top-0 z-30 -mx-4 flex h-[64px] items-start bg-bg/90 px-4 pt-1 backdrop-blur" aria-label="לשוניות">
        <div className="grid w-full grid-cols-3 gap-1 rounded-card bg-surface-2 p-1">
          {(
            [
              ["calendar", "יומן", CalendarDays],
              ["mine", "שלי", ListChecks],
              ["find", "חיפוש", Search],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              aria-current={tab === k ? "page" : undefined}
              onClick={() => setTab(k)}
              className={`relative flex min-h-11 items-center justify-center gap-2 rounded-ctl text-sm font-bold transition-all ${
                tab === k ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-muted hover:text-fg"
              }`}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
              {label}
              {k === "mine" && data.mine && data.mine.some((r) => r.data.day >= today) ? (
                <span className="absolute end-2 top-2 size-2 rounded-full bg-accent" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </div>
      </nav>

      {tab === "calendar" ? (
        <div className="space-y-3">
          {day === today ? (
            <NowStrip
              data={data}
              today={today}
              now={now}
              onBook={(m, time) => {
                setKind(m.kind);
                setSheet({ type: "book", day: today, time, choices: [m], machine: m });
              }}
            />
          ) : null}
          <WeekNav day={day} today={today} horizon={horizon} onChange={setDay} marked={marked} onOpenMonth={() => setSheet({ type: "month" })} />
          <KindSwitch
            kind={view}
            withAll
            onChange={(v) => {
              setView(v);
              if (v !== "all") setKind(v);
            }}
          />
          {!bookable ? (
            <p className="flex items-center gap-2 rounded-ctl border border-line bg-surface-2 px-3 py-2 text-sm text-muted">
              <Eye className="size-4 shrink-0" aria-hidden="true" />
              {day < today
                ? "יום שעבר — צפייה בלבד"
                : `צפייה בלבד — אפשר לשריין עד ${BOOK_DAYS_AHEAD / 7} שבועות קדימה (עד ${Number(horizon.slice(8))}.${Number(horizon.slice(5, 7))})`}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3 px-1">
            <Legend />
            <span className="shrink-0 text-xs font-semibold text-muted">
              השבוע:{" "}
              {view === "all"
                ? `${data.usedInWeek(day, "washer")}/${WEEKLY_LIMIT} ${KIND_LABEL.washer.many} · ${data.usedInWeek(day, "dryer")}/${WEEKLY_LIMIT} ${KIND_LABEL.dryer.many}`
                : `${data.usedInWeek(day, view)}/${WEEKLY_LIMIT} ${KIND_LABEL[view].many}`}
            </span>
          </div>
          <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <CalendarGrid
            data={data}
            day={day}
            kind={view}
            now={now}
            bookable={bookable}
            onFree={openFree}
            onBooked={(rec) => setSheet({ type: "booking", rec })}
            onMachine={(m) => {
              setNote(data.broken[m.id]?.data.note ?? "");
              setSheet({ type: "machine", machine: m });
            }}
          />
          </div>
        </div>
      ) : tab === "mine" ? (
        <MyBookings data={data} today={today} now={now} onOpen={(rec) => setSheet({ type: "booking", rec })} onFind={() => setTab("find")} />
      ) : (
        <Finder data={data} today={today} now={now} kind={kind} onKind={setKind} onPick={openPick} />
      )}

      {/* sheets */}
      <Sheet open={sheet?.type === "book"} title="שריון משבצת" onClose={close}>
        {sheet?.type === "book" ? (
          <>
            {sheet.choices.length > 1 ? (
              <div className="mb-3">
                <p className="section-title mb-2">בחירת מכונה</p>
                <div className="flex flex-wrap gap-2">
                  {sheet.choices.map((m) => (
                    <button key={m.id} type="button" className="chip" aria-pressed={sheet.machine.id === m.id} onClick={() => setSheet({ ...sheet, machine: m })}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="divide-y divide-line rounded-ctl border border-line px-4">
              <Detail label="מכונה">{sheet.machine.label}</Detail>
              <Detail label="יום">{dayLabel(sheet.day, today)}</Detail>
              <Detail label="שעה">
                <span className="tabular-nums">
                  {sheet.time}–{slotEnd(sheet.time)}
                </span>
              </Detail>
              <Detail label="המכסה השבוע">
                {data.usedInWeek(sheet.day, sheet.machine.kind) + 1}/{WEEKLY_LIMIT} {KIND_LABEL[sheet.machine.kind].many}
              </Detail>
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted">
              <Phone className="size-4 shrink-0" aria-hidden="true" />
              {data.me?.phone ? (
                <span>
                  השם והטלפון שלך (<span dir="ltr">{data.me.phone}</span>) יוצגו במשבצת לכולם — כדי שיוכלו לתאם איתך.
                </span>
              ) : (
                <span>השם שלך יוצג במשבצת. אין טלפון בפרופיל — כדאי להוסיף כדי שיוכלו לתאם איתך.</span>
              )}
            </p>
            <p className="mt-2 flex items-center gap-2 text-xs text-muted">
              <BellRing className="size-4 shrink-0" aria-hidden="true" />
              תזכורת {REMINDER_MINUTES} דק&apos; לפני — אם ההתראות מופעלות בפרופיל.
            </p>
            {data.usedInWeek(sheet.day, sheet.machine.kind) >= WEEKLY_LIMIT ? (
              <p className="mt-3 rounded-ctl bg-warning-soft p-3 text-sm font-medium text-warning">
                ניצלת את {WEEKLY_LIMIT} ה{KIND_LABEL[sheet.machine.kind].many} של השבוע הזה.
              </p>
            ) : null}
            <button
              type="button"
              className="btn mt-4 h-12 w-full"
              onClick={confirmBook}
              disabled={busy || data.usedInWeek(sheet.day, sheet.machine.kind) >= WEEKLY_LIMIT}
            >
              {busy ? "משריין…" : "שריון"}
            </button>
          </>
        ) : null}
      </Sheet>

      <Sheet open={sheet?.type === "booking"} title={sheet?.type === "booking" && sheet.rec.mine ? "השריון שלי" : "משבצת תפוסה"} onClose={close}>
        {sheet?.type === "booking" ? (
          <>
            <div className="divide-y divide-line rounded-ctl border border-line px-4">
              <Detail label="מכונה">{machineById(sheet.rec.data.machine)?.label}</Detail>
              <Detail label="יום">{dayLabel(sheet.rec.data.day, today)}</Detail>
              <Detail label="שעה">
                <span className="tabular-nums">
                  {sheet.rec.data.time}–{slotEnd(sheet.rec.data.time)}
                </span>
              </Detail>
            </div>
            {!sheet.rec.mine ? (
              <div className="mt-3">
                <p className="section-title mb-2">שוריין ע״י</p>
                {sheet.rec.data.phone ? (
                  <div className="rounded-card border border-line bg-bg-elevated p-4" data-testid="booker-card">
                    <p className="text-lg font-extrabold">{sheet.rec.owner.name}</p>
                    <p className="mt-0.5 text-base font-bold tabular-nums text-muted" dir="ltr">
                      {sheet.rec.data.phone}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <a href={`tel:${sheet.rec.data.phone.replace(/[^\d+]/g, "")}`} className="btn-secondary min-h-11">
                        <Phone className="size-4 text-accent" aria-hidden="true" /> חיוג
                      </a>
                      <a
                        href={`https://wa.me/972${sheet.rec.data.phone.replace(/\D/g, "").replace(/^0/, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary min-h-11"
                      >
                        <MessageCircle className="size-4 text-accent" aria-hidden="true" /> וואטסאפ
                      </a>
                    </div>
                  </div>
                ) : (
                  <PersonCard id={sheet.rec.owner.id} fallbackName={sheet.rec.owner.name} />
                )}
              </div>
            ) : null}
            {sheet.rec.mine || data.canModerate ? (
              <button
                type="button"
                className="btn-danger mt-4 h-12 w-full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const ok = await data.cancel(sheet.rec);
                  setBusy(false);
                  if (ok) setSheet(null);
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {sheet.rec.mine ? "ביטול השריון" : "פינוי המשבצת (מפקד/ת)"}
              </button>
            ) : null}
          </>
        ) : null}
      </Sheet>

      <Sheet open={sheet?.type === "month"} title="מעבר לתאריך" onClose={close}>
        {sheet?.type === "month" ? (
          <MonthPicker
            day={day}
            today={today}
            horizon={horizon}
            marked={marked}
            onPick={(d) => {
              setDay(d);
              setSheet(null);
            }}
          />
        ) : null}
      </Sheet>

      <Sheet open={sheet?.type === "machine"} title={sheet?.type === "machine" ? sheet.machine.label : ""} onClose={close}>
        {sheet?.type === "machine" ? (
          data.canModerate ? (
            <>
              <p className="text-sm text-muted">מכונה תקולה לא תופיע לשריון. שריונים קיימים לא נמחקים — כדאי לפנות אותם ידנית.</p>
              {!data.broken[sheet.machine.id] ? (
                <>
                  <label className="label" htmlFor="broken-note">
                    הערה (לא חובה)
                  </label>
                  <input id="broken-note" className="field" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: לא מסחררת" />
                </>
              ) : (
                <p className="mt-3 rounded-ctl bg-danger-soft p-3 text-sm text-danger">מסומנת כתקולה{data.broken[sheet.machine.id].data.note ? `: ${data.broken[sheet.machine.id].data.note}` : ""}</p>
              )}
              <button
                type="button"
                className={`${data.broken[sheet.machine.id] ? "btn" : "btn-danger"} mt-4 h-12 w-full`}
                onClick={async () => {
                  await data.setMachineBroken(sheet.machine.id, !data.broken[sheet.machine.id], note.trim());
                  setSheet(null);
                }}
              >
                <Wrench className="size-4" aria-hidden="true" />
                {data.broken[sheet.machine.id] ? "סימון כתקינה" : "סימון כתקולה"}
              </button>
            </>
          ) : (
            <p className="rounded-ctl bg-danger-soft p-3 text-sm text-danger">
              המכונה מסומנת כתקולה{data.broken[sheet.machine.id]?.data.note ? `: ${data.broken[sheet.machine.id].data.note}` : ""}.
            </p>
          )
        ) : null}
      </Sheet>
      <p className="mt-6 text-center text-xs text-subtle">
        {MACHINES.filter((m) => m.kind === "washer").length} מכונות כביסה (קומה 1, קומה 3) · מייבש אחד · משבצות של {SLOT_MINUTES} דקות ·
        עד {WEEKLY_LIMIT} כביסות ו-{WEEKLY_LIMIT} ייבושים לשבוע
      </p>
      <span className="sr-only">{israelDay(now)}</span>
    </main>
  );
}
