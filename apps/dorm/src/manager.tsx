"use client";
// תכלול — the battalion logistics officer's dashboard (app managers + admins).
// Views: סקירה (status at a glance) · חלוקה (what to hand out, walking order) · פניות (every open request, filterable)
//        · חדרים (room-by-room table) · היסטוריה (recently handled).
import { useState } from "react";
import { AlarmClock, CheckCheck, ClipboardCopy, Hammer, History, Info, LayoutDashboard, ListTodo, PackageCheck, PenLine, Route, Search, TriangleAlert, X } from "lucide-react";
import { FLOORS, PLANS, ROOMS, areaById, routeOrder, type Floor } from "./building";
import { ITEMS, itemById, type Group } from "./items";
import { ago, roomState, type Dorm, type TicketRec } from "./data";
import { TicketCard } from "./ticket-card";

type View = "overview" | "distribute" | "requests" | "rooms" | "history";
const VIEWS: [View, string, typeof LayoutDashboard][] = [
  ["overview", "סקירה", LayoutDashboard],
  ["distribute", "חלוקה", Route],
  ["requests", "פניות", ListTodo],
  ["rooms", "חדרים", CheckCheck],
  ["history", "היסטוריה", History],
];
type Cat = "all" | Group | "free";
const CATS: [Cat, string][] = [
  ["all", "הכול"],
  ["supply", "מתכלים"],
  ["equipment", "ציוד"],
  ["fault", "תקלות ובינוי"],
  ["free", "כתיבה חופשית"],
];
const inCat = (t: TicketRec, c: Cat) => {
  const it = itemById(t.data.item);
  if (!it) return false;
  if (c === "all") return true;
  if (c === "free") return !!it.needsNote;
  return it.group === c;
};

function Kpi({ icon, label, value, tone, onClick }: { icon: React.ReactNode; label: string; value: string | number; tone: "danger" | "warning" | "success" | "plain"; onClick?: () => void }) {
  const cls = {
    danger: "border-danger/25 bg-danger-soft text-danger",
    warning: "border-warning/25 bg-warning-soft text-warning",
    success: "border-success/25 bg-success-soft text-success",
    plain: "border-line bg-surface text-fg",
  }[tone];
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className={`rounded-card border p-3 text-start shadow-[var(--shadow-sm)] transition-transform enabled:active:scale-[0.98] ${cls}`}>
      <span className="[&_svg]:size-5" aria-hidden="true">
        {icon}
      </span>
      <p className="mt-1.5 text-2xl font-extrabold tabular-nums">{value}</p>
      <p className="text-xs font-semibold opacity-85">{label}</p>
    </button>
  );
}

const STATE_DOT = { fault: "bg-danger", missing: "bg-warning", ok: "bg-success", unknown: "bg-line-strong" } as const;

export function ManagerDashboard({ d, onOpenRoom }: { d: Dorm; onOpenRoom: (room: string) => void }) {
  const [view, setView] = useState<View>("overview");
  const [floor, setFloor] = useState<Floor | "all">("all");
  const [cat, setCat] = useState<Cat>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const inFloor = (room: string) => floor === "all" || areaById(room)?.floor === floor;

  const open = (d.open ?? []).filter((t) => inFloor(t.data.room));
  const rooms = ROOMS.filter((r) => inFloor(r.id));
  const confirmed = rooms.filter((r) => d.checkByRoom.has(r.id));
  const notConfirmed = rooms.filter((r) => !d.checkByRoom.has(r.id));
  const faults = open.filter((t) => itemById(t.data.item)?.group === "fault");
  const free = open.filter((t) => itemById(t.data.item)?.needsNote);
  const oldest = open[0];

  // Distribution list: supplies + listed equipment, rooms in walking order.
  const distribution = ITEMS.filter((i) => i.group !== "fault")
    .map((i) => ({ item: i, list: open.filter((t) => t.data.item === i.id).sort((a, b) => routeOrder(a.data.room, b.data.room)) }))
    .filter((x) => x.list.length);
  // Rooms that confirmed "all handled" today but still have open requests → probably safe to close.
  const confirmedOpen = confirmed.map((r) => ({ room: r.id, list: d.openByRoom.get(r.id) ?? [] })).filter((x) => x.list.length);

  const needle = q.trim();
  const requests = open
    .filter((t) => inCat(t, cat))
    .filter((t) => !needle || t.data.room.includes(needle) || (t.data.note ?? "").includes(needle) || (itemById(t.data.item)?.label ?? "").includes(needle))
    .sort((a, b) => routeOrder(a.data.room, b.data.room));

  const close = async (list: TicketRec[], reply?: string) => {
    setBusy(true);
    await d.closeMany(list, reply);
    setBusy(false);
  };
  const copy = async () => {
    const lines = [`רשימת חלוקה — ${new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short" }).format(new Date())}`];
    for (const { item, list } of distribution) lines.push(`${item.emoji} ${item.label} (${list.length}): ${list.map((t) => areaById(t.data.room)?.short).join(", ")}`);
    if (faults.length) lines.push(`🛠️ תקלות ובינוי (${faults.length}): ${faults.map((t) => `${areaById(t.data.room)?.short} ${itemById(t.data.item)?.needsNote && t.data.note ? t.data.note : itemById(t.data.item)?.short}`).join(", ")}`);
    const freeMissing = open.filter((t) => t.data.item === "other_missing");
    if (freeMissing.length) lines.push(`📦 ציוד חסר — כתיבה חופשית (${freeMissing.length}): ${freeMissing.map((t) => `${areaById(t.data.room)?.short} ${t.data.note ?? ""}`).join(", ")}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div className="space-y-4">
      {/* view switcher — scrolls sideways on narrow phones */}
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <div className="flex min-w-max gap-1 rounded-card bg-surface-2 p-1" role="tablist" aria-label="תצוגות התכלול">
          {VIEWS.map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={view === k}
              onClick={() => setView(k)}
              className={`flex min-h-11 items-center gap-1.5 rounded-ctl px-3.5 text-sm font-bold transition-all ${view === k ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-muted"}`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
              {k === "requests" && open.length ? <span className="badge-danger px-1.5 text-[10px]">{open.length}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {/* floor filter (all views) */}
      <div className="flex gap-1.5" role="group" aria-label="סינון לפי קומה">
        {(["all", ...FLOORS] as const).map((f) => (
          <button key={f} type="button" className="chip flex-1 justify-center" aria-pressed={floor === f} onClick={() => setFloor(f)}>
            {f === "all" ? "הכול" : `קומה ${f}`}
          </button>
        ))}
      </div>

      {view === "overview" ? (
        <div className="space-y-4 animate-rise">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi icon={<PackageCheck />} label="פניות פתוחות" value={open.length} tone={open.length ? "warning" : "plain"} onClick={() => setView("requests")} />
            <Kpi
              icon={<TriangleAlert />}
              label="תקלות ובינוי"
              value={faults.length}
              tone={faults.length ? "danger" : "plain"}
              onClick={() => {
                setCat("fault");
                setView("requests");
              }}
            />
            <Kpi icon={<CheckCheck />} label="חדרים אישרו היום" value={`${confirmed.length}/${rooms.length}`} tone={confirmed.length === rooms.length ? "success" : "plain"} onClick={() => setView("rooms")} />
            <Kpi icon={<AlarmClock />} label="הפנייה הוותיקה" value={oldest ? ago(oldest.createdAt) : "—"} tone="plain" />
          </div>

          {/* per-floor snapshot */}
          <section className="card overflow-hidden p-0">
            <h2 className="px-4 pt-4 text-lg font-extrabold">תמונת מצב לפי קומה</h2>
            <ul className="mt-2 divide-y divide-line">
              {FLOORS.filter((f) => floor === "all" || floor === f).map((f) => {
                const fo = (d.open ?? []).filter((t) => areaById(t.data.room)?.floor === f);
                const ff = fo.filter((t) => itemById(t.data.item)?.group === "fault").length;
                const fr = ROOMS.filter((r) => r.floor === f);
                const fc = fr.filter((r) => d.checkByRoom.has(r.id)).length;
                return (
                  <li key={f} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-extrabold">קומה {f}</p>
                      <p className="flex gap-3 text-xs font-bold tabular-nums">
                        <span className={fo.length ? "text-warning" : "text-muted"}>{fo.length} פתוחות</span>
                        <span className={ff ? "text-danger" : "text-muted"}>{ff} תקלות</span>
                        <span className={fc === fr.length ? "text-success" : "text-muted"}>
                          {fc}/{fr.length} אישרו
                        </span>
                      </p>
                    </div>
                    {/* one dot per room, in walking order — tap to open */}
                    <div className="mt-2 grid grid-cols-10 gap-1">
                      {[...PLANS[f].even, ...PLANS[f].odd].map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => onOpenRoom(id)}
                          aria-label={`חדר ${id}`}
                          className="flex h-8 flex-col items-center justify-center rounded-md bg-surface-2 text-[10px] font-bold tabular-nums hover:ring-2 hover:ring-accent/40"
                        >
                          <span className={`size-2 rounded-full ${STATE_DOT[roomState(d, id)]}`} aria-hidden="true" />
                          {id.slice(1)}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line px-4 py-2.5 text-[11px] text-muted">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-danger" /> תקלה
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-warning" /> חסר
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-success" /> אושר היום
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-line-strong" /> לא אישרו
              </span>
            </p>
          </section>

          {free.length ? (
            <section className="card p-4">
              <h2 className="flex items-center gap-2 text-lg font-extrabold">
                <PenLine className="size-5 text-accent" aria-hidden="true" /> נכתב בחופשיות ({free.length})
              </h2>
              <p className="text-xs text-muted">פניות שלא ברשימה — שווה לקרוא.</p>
              <ul className="mt-3 space-y-2">
                {free.slice(0, 6).map((t) => (
                  <TicketCard key={t.id} d={d} t={t} showRoom />
                ))}
              </ul>
              {free.length > 6 ? (
                <button
                  type="button"
                  className="btn-ghost mt-2 w-full"
                  onClick={() => {
                    setCat("free");
                    setView("requests");
                  }}
                >
                  לכל {free.length} הפניות ←
                </button>
              ) : null}
            </section>
          ) : null}

          {confirmedOpen.length ? (
            <section className="card border-success/30 p-4">
              <h2 className="text-lg font-extrabold">אישרו שהכול טופל — אבל יש פניות פתוחות</h2>
              <p className="text-xs text-muted">החדר לחץ היום &quot;הכול תקין&quot;. אם זה נכון — סוגרים בלחיצה.</p>
              <ul className="mt-3 space-y-2">
                {confirmedOpen.map(({ room, list }) => (
                  <li key={room} className="flex flex-wrap items-center justify-between gap-2 rounded-ctl border border-line p-2.5">
                    <button type="button" className="text-start" onClick={() => onOpenRoom(room)}>
                      <span className="font-extrabold tabular-nums">{room}</span> <span className="text-sm text-muted">{list.map((t) => itemById(t.data.item)?.emoji).join(" ")}</span>
                    </button>
                    <button type="button" className="btn min-h-11" disabled={busy} onClick={() => close(list, "החדר אישר שטופל")}>
                      סגירת {list.length === 1 ? "הפנייה" : `${list.length} הפניות`}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {d.me?.role === "admin" ? (
            <p className="flex items-start gap-2 rounded-ctl bg-surface-2 p-3 text-xs leading-relaxed text-muted">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                מי רואה את לוח התכלול? מנהלי האתר, ומי שהוגדר כקל&quot;ג: <b>ניהול → אפליקציות → מאסטר הלוגיסטיקה → מנהלי האפליקציה → הוספה</b>.
              </span>
            </p>
          ) : null}
        </div>
      ) : view === "distribute" ? (
        <section className="card p-4 animate-rise">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <Route className="size-5 text-accent" aria-hidden="true" /> רשימת חלוקה
            </h2>
            <button type="button" className="btn-secondary min-h-11" onClick={copy} disabled={!distribution.length && !faults.length}>
              <ClipboardCopy className="size-4" aria-hidden="true" /> {copied ? "הועתק ✓" : "העתקה לווטסאפ"}
            </button>
          </div>
          <p className="text-xs text-muted">החדרים מסודרים לפי מסלול הליכה — סיבוב אחד בטבעת לכל קומה.</p>
          {distribution.length ? (
            <ul className="mt-3 space-y-3">
              {distribution.map(({ item, list }) => (
                <li key={item.id} className="rounded-ctl border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">
                      <span aria-hidden="true">{item.emoji}</span> {item.label} <span className="text-muted">· {list.length}</span>
                    </p>
                    <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={() => close(list, "חולק ✓")}>
                      <CheckCheck className="size-4" aria-hidden="true" /> חולק לכולם
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {list.map((t) => (
                      <button key={t.id} type="button" onClick={() => onOpenRoom(t.data.room)} className="min-h-9 rounded-full border border-line bg-surface-2 px-3 text-sm font-bold tabular-nums hover:border-accent">
                        {areaById(t.data.room)?.short}
                        {(d.plusBy.get(t.id) ?? []).length ? <span className="ms-1 text-xs text-gold">+{(d.plusBy.get(t.id) ?? []).length}</span> : null}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-ctl border border-dashed border-line p-4 text-center text-sm text-muted">אין מה לחלק כרגע 🎉</p>
          )}
        </section>
      ) : view === "requests" ? (
        <div className="space-y-3 animate-rise">
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="סינון לפי סוג">
            {CATS.map(([k, label]) => {
              const n = open.filter((t) => inCat(t, k)).length;
              return (
                <button key={k} type="button" className="chip shrink-0" aria-pressed={cat === k} onClick={() => setCat(k)}>
                  {k === "fault" ? <Hammer className="size-3.5" aria-hidden="true" /> : null}
                  {label} <span className="count">{n}</span>
                </button>
              );
            })}
          </div>
          <div className="relative">
            <label htmlFor="req-search" className="sr-only">
              חיפוש לפי חדר או מילה
            </label>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
            <input id="req-search" type="search" className="field ps-9 pe-10" placeholder="חיפוש: מספר חדר או מילה" value={q} onChange={(e) => setQ(e.target.value)} />
            {q ? (
              <button type="button" className="icon-btn absolute end-1 top-1/2 -translate-y-1/2" aria-label="ניקוי" onClick={() => setQ("")}>
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {requests.length ? (
            <ul className="space-y-2">
              {requests.map((t) => (
                <TicketCard key={t.id} d={d} t={t} showRoom />
              ))}
            </ul>
          ) : (
            <p className="rounded-ctl border border-dashed border-line p-6 text-center text-sm text-muted">אין פניות פתוחות בסינון הזה 🎉</p>
          )}
        </div>
      ) : view === "rooms" ? (
        <div className="space-y-4 animate-rise">
          <section className="card overflow-hidden p-0">
            <h2 className="px-4 pt-4 text-lg font-extrabold">חדר אחר חדר</h2>
            <p className="px-4 text-xs text-muted">לחיצה על שורה — כל הפרטים, הערות המסדר ופעולות.</p>
            <ul className="mt-2 divide-y divide-line">
              {rooms
                .slice()
                .sort((a, b) => routeOrder(a.id, b.id))
                .map((r) => {
                  const list = d.openByRoom.get(r.id) ?? [];
                  const st = roomState(d, r.id);
                  const chk = d.checkByRoom.get(r.id);
                  return (
                    <li key={r.id}>
                      <button type="button" onClick={() => onOpenRoom(r.id)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-start hover:bg-surface-2">
                        <span className={`size-2.5 shrink-0 rounded-full ${STATE_DOT[st]}`} aria-hidden="true" />
                        <span className="w-12 font-extrabold tabular-nums">{r.id}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{list.length ? list.map((t) => itemById(t.data.item)?.emoji).join(" ") : <span className="text-muted">—</span>}</span>
                        <span className={`shrink-0 text-xs font-semibold ${chk ? "text-success" : "text-subtle"}`}>{chk ? `✓ ${chk.owner.name.split(" ")[0]}` : "לא אישרו"}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </section>
          <section className="card p-4">
            <h2 className="text-lg font-extrabold">עוד לא אישרו היום ({notConfirmed.length})</h2>
            {notConfirmed.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {notConfirmed.map((r) => (
                  <button key={r.id} type="button" onClick={() => onOpenRoom(r.id)} className="min-h-9 rounded-full border border-line px-3 text-sm font-bold tabular-nums hover:border-accent">
                    {r.short}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-success">כל החדרים אישרו היום ✓</p>
            )}
          </section>
        </div>
      ) : (
        <section className="space-y-2 animate-rise">
          <h2 className="text-lg font-extrabold">טופלו לאחרונה</h2>
          {d.closed.filter((t) => inFloor(t.data.room)).length ? (
            <ul className="space-y-2">
              {d.closed
                .filter((t) => inFloor(t.data.room))
                .slice(0, 60)
                .map((t) => (
                  <TicketCard key={t.id} d={d} t={t} showRoom />
                ))}
            </ul>
          ) : (
            <p className="rounded-ctl border border-dashed border-line p-6 text-center text-sm text-muted">עוד לא נסגרו פניות.</p>
          )}
        </section>
      )}
    </div>
  );
}
