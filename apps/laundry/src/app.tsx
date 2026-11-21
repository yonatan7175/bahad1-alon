"use client";
// לו"ז מכונות כביסה v4 — calendar of 40-minute slots: one washer, one dryer.
// A booking takes the whole machine or shares the slot with one more person. Every booked slot shows who and their phone.
// Tabs: יומן (calendar) · שלי (my bookings + weekly quota) · חיפוש (find a free slot).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, CalendarDays, Eye, ListChecks, MessageCircle, Phone, Search, Trash2, User, Users, Wrench } from "lucide-react";
import { useBahad } from "@/platform/client";
import { BOOK_DAYS_AHEAD, KIND_LABEL, REMINDER_MINUTES, SLOT_MINUTES, WEEKLY_LIMIT, machineById, type Kind, type Machine } from "./machines";
import { addDays, dayLabel, israelDay, slotEnd, slotStart } from "./time";
import { groupSlots, isShared, slotState, useLaundry, type LegacyRec, type Rec } from "./data";
import { legacyRange } from "./legacy";
import { CalendarGrid, KindSwitch, Legend, MonthPicker, WeekNav, type View } from "./calendar";
import { PersonCard } from "./person-card";
import { MyBookings } from "./mine";
import { Finder, type FreeSlot } from "./finder";
import { Detail, Sheet } from "./sheet";
import { NowStrip } from "./now-strip";

type Tab = "calendar" | "mine" | "find";
type SheetState =
  /** Book a free slot, or join a slot someone shares (then seats is always 1). */
  | { type: "book"; day: string; time: string; choices: Machine[]; machine: Machine; seats: 1 | 2 }
  /** A slot with bookings: who holds it, and managing mine. */
  | { type: "slot"; day: string; time: string; machine: Machine }
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
  /** The calendar shows both machines by default; "כביסה"/"ייבוש" narrow it. */
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

  // "שלי" shows who shares each booking — load the days of my upcoming bookings.
  const { mine, byDay } = data;
  useEffect(() => {
    if (tab !== "mine" || !mine) return;
    for (const d of new Set(mine.map((r) => r.data.day))) if (d >= today && !byDay[d]) void loadDay(d).catch(() => {});
  }, [tab, mine, byDay, today, loadDay]);

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

  /** Live state of a slot (updates while a sheet is open). */
  const stateOf = (d: string, m: Machine, time: string) => slotState(groupSlots(data.byDay[d]).get(`${m.id}|${time}`));
  const openFree = (m: Machine, time: string) => setSheet({ type: "book", day, time, choices: [m], machine: m, seats: 2 });
  const openPick = (s: FreeSlot) => setSheet({ type: "book", day: s.day, time: s.time, choices: s.free, machine: s.free[0], seats: 2 });
  const openSlot = (d: string, m: Machine, time: string) => {
    const st = stateOf(d, m, time);
    const future = slotStart(d, time).getTime() + SLOT_MINUTES * 60_000 > now.getTime();
    const joinable = !st.mine && st.left > 0 && future && d >= today && d <= horizon && !data.broken[m.id];
    setSheet(joinable ? { type: "book", day: d, time, choices: [m], machine: m, seats: 1 } : { type: "slot", day: d, time, machine: m });
  };
  const openRec = (rec: Rec) => {
    const m = machineById(rec.data.machine);
    if (m) setSheet({ type: "slot", day: rec.data.day, time: rec.data.time, machine: m });
  };

  // The book sheet follows the slot live: if someone took a seat meanwhile, only sharing is left.
  const bookState = sheet?.type === "book" ? stateOf(sheet.day, sheet.machine, sheet.time) : null;
  const bookSeats: 1 | 2 = sheet?.type === "book" ? (bookState && bookState.recs.length ? 1 : sheet.seats) : 2;
  const bookFull = !!bookState && (bookState.left === 0 || !!bookState.mine);

  const confirmBook = async () => {
    if (sheet?.type !== "book") return;
    setBusy(true);
    const ok = await data.book(sheet.machine, sheet.day, sheet.time, bookSeats);
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
                openSlot(today, m, time);
              }}
              onFree={(m, time) => {
                setKind(m.kind);
                setSheet({ type: "book", day: today, time, choices: [m], machine: m, seats: 2 });
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
            onSlot={(m, time) => openSlot(day, m, time)}
            onMachine={(m) => {
              setNote(data.broken[m.id]?.data.note ?? "");
              setSheet({ type: "machine", machine: m });
            }}
          />
          </div>
        </div>
      ) : tab === "mine" ? (
        <MyBookings data={data} today={today} now={now} onOpen={openRec} onFind={() => setTab("find")} />
      ) : (
        <Finder data={data} today={today} now={now} kind={kind} onKind={setKind} onPick={openPick} />
      )}

      {/* sheets */}
      <Sheet open={sheet?.type === "book"} title={bookState?.recs.length ? "הצטרפות למשבצת" : "שריון משבצת"} onClose={close}>
        {sheet?.type === "book" && bookState ? (
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
                <span className="tabular-nums" dir="ltr">
                  {sheet.time}–{slotEnd(sheet.time)}
                </span>
              </Detail>
              <Detail label="המכסה השבוע">
                {data.usedInWeek(sheet.day, sheet.machine.kind) + 1}/{WEEKLY_LIMIT} {KIND_LABEL[sheet.machine.kind].many}
              </Detail>
            </div>

            {bookState.recs.length ? (
              <div className="mt-3">
                <p className="section-title mb-2">{bookFull ? "המשבצת כבר מלאה" : "תתחלק/י במשבצת עם"}</p>
                {bookState.recs.filter((r) => !r.mine).map((r) => (
                  <Booker key={r.id} rec={r} />
                ))}
              </div>
            ) : (
              <div className="mt-3">
                <p className="section-title mb-2">איך לשריין</p>
                <div role="radiogroup" aria-label="איך לשריין" className="grid grid-cols-2 gap-2">
                  {(
                    [
                      [2, "כל המכונה", "רק את/ה במשבצת", User],
                      [1, "בחלוקה", "מקום לעוד אחד/ת", Users],
                    ] as const
                  ).map(([n, title, sub, Icon]) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={bookSeats === n}
                      onClick={() => setSheet({ ...sheet, seats: n })}
                      className={`flex min-h-[72px] flex-col items-start gap-0.5 rounded-ctl border p-3 text-start transition-all ${
                        bookSeats === n ? "border-accent bg-accent-soft ring-1 ring-accent/30" : "border-line hover:bg-surface-2"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-bold">
                        <Icon className="size-4 text-accent" aria-hidden="true" />
                        {title}
                      </span>
                      <span className="text-xs text-muted">{sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

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
              disabled={busy || bookFull || data.usedInWeek(sheet.day, sheet.machine.kind) >= WEEKLY_LIMIT}
            >
              {busy ? "משריין…" : bookState.recs.length ? "הצטרפות" : "שריון"}
            </button>
          </>
        ) : null}
      </Sheet>

      <Sheet
        open={sheet?.type === "slot"}
        title={sheet?.type === "slot" && stateOf(sheet.day, sheet.machine, sheet.time).mine ? "השריון שלי" : "משבצת תפוסה"}
        onClose={close}
      >
        {sheet?.type === "slot"
          ? (() => {
              const st = stateOf(sheet.day, sheet.machine, sheet.time);
              const mine = st.mine;
              const others = st.recs.filter((r) => !r.mine);
              const future = slotStart(sheet.day, sheet.time).getTime() + SLOT_MINUTES * 60_000 > now.getTime();
              const run = async (f: () => Promise<boolean>, closeAfter: boolean) => {
                setBusy(true);
                const ok = await f();
                setBusy(false);
                if (ok && closeAfter) setSheet(null);
              };
              return (
                <>
                  <div className="divide-y divide-line rounded-ctl border border-line px-4">
                    <Detail label="מכונה">{sheet.machine.label}</Detail>
                    <Detail label="יום">{dayLabel(sheet.day, today)}</Detail>
                    <Detail label="שעה">
                      <span className="tabular-nums" dir="ltr">
                        {sheet.time}–{slotEnd(sheet.time)}
                      </span>
                    </Detail>
                    {mine ? (
                      <Detail label="סוג">{isShared(mine) ? (others.length ? `בחלוקה עם ${data.nameOf(others[0])}` : "בחלוקה — מקום לעוד אחד") : "כל המכונה"}</Detail>
                    ) : null}
                  </div>
                  {st.recs.length === 0 ? <p className="mt-3 text-sm text-muted">המשבצת התפנתה.</p> : null}
                  {others.length ? (
                    <div className="mt-3 space-y-2">
                      <p className="section-title">{mine ? "מתחלק/ת איתך" : others.length > 1 ? "שוריין ע״י (בחלוקה)" : "שוריין ע״י"}</p>
                      {others.map((r) => {
                        const old = data.legacyOf(r);
                        return (
                          <div key={r.id} className="space-y-2">
                            {old ? (
                              <>
                                {old.map((l) => (
                                  <LegacyCard key={l.id} rec={l} />
                                ))}
                                <p className="text-xs text-muted">
                                  {old.length > 1 ? "השתבצויות" : "השתבצות"} מהיומן הקודם, בשעות המקוריות — לכן כל המשבצת ({sheet.time}–{slotEnd(sheet.time)}) תפוסה.
                                </p>
                              </>
                            ) : (
                              <Booker rec={r} />
                            )}
                            {data.canModerate ? (
                              <button type="button" className="btn-danger min-h-11 w-full" disabled={busy} onClick={() => run(() => data.cancel(r), others.length === 1 && !mine)}>
                                <Trash2 className="size-4" aria-hidden="true" />
                                {old ? "פינוי המשבצת (מנהל)" : `פינוי ${r.owner.name} (מפקד/ת)`}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {mine && future ? (
                    isShared(mine) ? (
                      others.length === 0 ? (
                        <button type="button" className="btn-secondary mt-4 h-12 w-full" disabled={busy} onClick={() => run(() => data.setSeats(mine, 2), false)}>
                          <User className="size-4" aria-hidden="true" /> לתפוס את כל המכונה
                        </button>
                      ) : null
                    ) : (
                      <button type="button" className="btn-secondary mt-4 h-12 w-full" disabled={busy} onClick={() => run(() => data.setSeats(mine, 1), false)}>
                        <Users className="size-4" aria-hidden="true" /> לפתוח לחלוקה עם עוד מישהו
                      </button>
                    )
                  ) : null}
                  {mine ? (
                    <button type="button" className="btn-danger mt-3 h-12 w-full" disabled={busy} onClick={() => run(() => data.cancel(mine), true)}>
                      <Trash2 className="size-4" aria-hidden="true" />
                      ביטול השריון
                    </button>
                  ) : null}
                </>
              );
            })()
          : null}
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
        מכונת כביסה ומייבש · משבצות של {SLOT_MINUTES} דקות · כל המכונה או בחלוקה לשניים ·
        עד {WEEKLY_LIMIT} כביסות ו-{WEEKLY_LIMIT} ייבושים לשבוע
      </p>
      <span className="sr-only">{israelDay(now)}</span>
    </main>
  );
}

/** Who holds a seat: name + phone with call / WhatsApp, or the directory card when no phone was saved. */
/** Israeli number → WhatsApp's international form: "054-1234567" / "+972 54…" → "97254…". */
const waNumber = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("972") ? d : `972${d.replace(/^0/, "")}`;
};

function ContactButtons({ phone }: { phone: string }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="btn-secondary min-h-11">
        <Phone className="size-4 text-accent" aria-hidden="true" /> חיוג
      </a>
      <a href={`https://wa.me/${waNumber(phone)}`} target="_blank" rel="noopener noreferrer" className="btn-secondary min-h-11">
        <MessageCircle className="size-4 text-accent" aria-hidden="true" /> וואטסאפ
      </a>
    </div>
  );
}

function Booker({ rec }: { rec: Rec }) {
  if (!rec.data.phone) return <PersonCard id={rec.owner.id} fallbackName={rec.owner.name} />;
  return (
    <div className="rounded-card border border-line bg-bg-elevated p-4" data-testid="booker-card">
      <p className="flex items-center gap-2 text-lg font-extrabold">
        {rec.owner.name}
        {isShared(rec) ? <span className="badge-accent">בחלוקה</span> : null}
      </p>
      <p className="mt-0.5 text-base font-bold tabular-nums text-muted">
        <span dir="ltr">{rec.data.phone}</span>
      </p>
      <ContactButtons phone={rec.data.phone} />
    </div>
  );
}

/** A booking carried over from the old calendar: its name, REAL time and phone(s). */
function LegacyCard({ rec }: { rec: LegacyRec }) {
  const l = rec.data;
  return (
    <div className="rounded-card border border-line bg-bg-elevated p-4" data-testid="legacy-card">
      <p className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
        {l.name}
        <span className="badge">מהיומן הקודם</span>
      </p>
      <p className="mt-0.5 text-sm font-semibold text-muted">
        <span className="tabular-nums" dir="ltr">
          {legacyRange(l)}
        </span>
      </p>
      {(l.phones ?? []).map((ph) => (
        <div key={ph} className="mt-2">
          <p className="text-base font-bold tabular-nums text-muted">
            <span dir="ltr">{ph}</span>
          </p>
          <ContactButtons phone={ph} />
        </div>
      ))}
    </div>
  );
}
