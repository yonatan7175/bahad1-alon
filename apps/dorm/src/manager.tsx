"use client";
// The battalion logistics officer's dashboard (app managers + admins).
import { useState } from "react";
import { AlarmClock, CheckCheck, ClipboardCopy, PackageCheck, Route, TriangleAlert } from "lucide-react";
import { FLOORS, ROOMS, areaById, routeOrder, type Floor } from "./building";
import { ITEMS, itemById } from "./items";
import { ago, type Dorm, type TicketRec } from "./data";
import { TicketCard } from "./ticket-card";

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone: "danger" | "warning" | "success" | "plain" }) {
  const cls = {
    danger: "border-danger/25 bg-danger-soft text-danger",
    warning: "border-warning/25 bg-warning-soft text-warning",
    success: "border-success/25 bg-success-soft text-success",
    plain: "border-line bg-surface text-fg",
  }[tone];
  return (
    <div className={`rounded-card border p-3 shadow-[var(--shadow-sm)] ${cls}`}>
      <span className="[&_svg]:size-5" aria-hidden="true">
        {icon}
      </span>
      <p className="mt-1.5 text-2xl font-extrabold tabular-nums">{value}</p>
      <p className="text-xs font-semibold opacity-85">{label}</p>
    </div>
  );
}

export function ManagerDashboard({ d, onOpenRoom }: { d: Dorm; onOpenRoom: (room: string) => void }) {
  const [floor, setFloor] = useState<Floor | "all">("all");
  const [busy, setBusy] = useState(false);
  const inFloor = (room: string) => floor === "all" || areaById(room)?.floor === floor;
  const [copied, setCopied] = useState(false);
  const open = (d.open ?? []).filter((t) => inFloor(t.data.room));
  const rooms = ROOMS.filter((r) => inFloor(r.id));
  const confirmed = rooms.filter((r) => d.checkByRoom.has(r.id));
  const notConfirmed = rooms.filter((r) => !d.checkByRoom.has(r.id));
  const faults = open.filter((t) => itemById(t.data.item)?.group === "fault");
  const oldest = open[0];

  // Distribution list: supplies + equipment, rooms in walking order.
  const distribution = ITEMS.filter((i) => i.group !== "fault")
    .map((i) => ({ item: i, list: open.filter((t) => t.data.item === i.id).sort((a, b) => routeOrder(a.data.room, b.data.room)) }))
    .filter((x) => x.list.length);

  // Rooms that confirmed "all handled" today but still have open requests → probably safe to close.
  const confirmedOpen = confirmed.map((r) => ({ room: r.id, list: d.openByRoom.get(r.id) ?? [] })).filter((x) => x.list.length);

  const close = async (list: TicketRec[], reply?: string) => {
    setBusy(true);
    await d.closeMany(list, reply);
    setBusy(false);
  };
  const copy = async () => {
    const lines = [`רשימת חלוקה — ${new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short" }).format(new Date())}`];
    for (const { item, list } of distribution) lines.push(`${item.emoji} ${item.label} (${list.length}): ${list.map((t) => `${areaById(t.data.room)?.short}${item.needsNote && t.data.note ? ` (${t.data.note})` : ""}`).join(", ")}`);
    if (faults.length) lines.push(`🛠️ תקלות (${faults.length}): ${faults.map((t) => `${areaById(t.data.room)?.short} ${itemById(t.data.item)?.needsNote && t.data.note ? t.data.note : itemById(t.data.item)?.short}`).join(", ")}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-card bg-surface-2 p-1" role="group" aria-label="סינון לפי קומה">
        {(["all", ...FLOORS] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={floor === f}
            onClick={() => setFloor(f)}
            className={`min-h-11 flex-1 rounded-ctl text-sm font-bold transition-all ${floor === f ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-muted"}`}
          >
            {f === "all" ? "כל המגורים" : `קומה ${f}`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi icon={<PackageCheck />} label="פניות פתוחות" value={open.length} tone={open.length ? "warning" : "plain"} />
        <Kpi icon={<TriangleAlert />} label="תקלות" value={faults.length} tone={faults.length ? "danger" : "plain"} />
        <Kpi icon={<CheckCheck />} label="חדרים אישרו היום" value={`${confirmed.length}/${rooms.length}`} tone={confirmed.length === rooms.length ? "success" : "plain"} />
        <Kpi icon={<AlarmClock />} label="הפנייה הוותיקה" value={oldest ? ago(oldest.createdAt) : "—"} tone="plain" />
      </div>

      <section className="card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Route className="size-5 text-accent" aria-hidden="true" /> רשימת חלוקה
          </h2>
          <button type="button" className="btn-ghost min-h-11" onClick={copy} disabled={!distribution.length && !faults.length}>
            <ClipboardCopy className="size-4" aria-hidden="true" /> {copied ? "הועתק ✓" : "העתקה"}
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
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpenRoom(t.data.room)}
                      className="min-h-9 rounded-full border border-line bg-surface-2 px-3 text-sm font-bold tabular-nums hover:border-accent"
                    >
                      {areaById(t.data.room)?.short}
                      {item.needsNote && t.data.note ? <span className="ms-1 font-medium text-muted">· {t.data.note.length > 28 ? `${t.data.note.slice(0, 28)}…` : t.data.note}</span> : null}
                      {(d.plusBy.get(t.id) ?? []).length ? <span className="ms-1 text-xs text-gold">+{(d.plusBy.get(t.id) ?? []).length}</span> : null}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">אין מה לחלק כרגע 🎉</p>
        )}
      </section>

      {confirmedOpen.length ? (
        <section className="card border-success/30 p-4">
          <h2 className="text-lg font-extrabold">אישרו שהכול טופל — אבל יש פניות פתוחות</h2>
          <p className="text-xs text-muted">החדר לחץ היום &quot;הכול תקין&quot;. אם זה נכון — סוגרים בלחיצה.</p>
          <ul className="mt-3 space-y-2">
            {confirmedOpen.map(({ room, list }) => (
              <li key={room} className="flex flex-wrap items-center justify-between gap-2 rounded-ctl border border-line p-2.5">
                <button type="button" className="text-start" onClick={() => onOpenRoom(room)}>
                  <span className="font-extrabold tabular-nums">{room}</span>{" "}
                  <span className="text-sm text-muted">{list.map((t) => itemById(t.data.item)?.emoji).join(" ")}</span>
                </button>
                <button type="button" className="btn min-h-11" disabled={busy} onClick={() => close(list, "החדר אישר שטופל")}>
                  סגירת {list.length === 1 ? "הפנייה" : `${list.length} הפניות`}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold">
          <TriangleAlert className="size-5 text-danger" aria-hidden="true" /> תקלות ({faults.length})
        </h2>
        {faults.length ? (
          <ul className="space-y-2">
            {faults.map((t) => (
              <TicketCard key={t.id} d={d} t={t} showRoom />
            ))}
          </ul>
        ) : (
          <p className="rounded-ctl border border-dashed border-line p-4 text-center text-sm text-muted">אין תקלות פתוחות</p>
        )}
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-extrabold">עוד לא אישרו היום ({notConfirmed.length})</h2>
        {notConfirmed.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {notConfirmed.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpenRoom(r.id)}
                className="min-h-9 rounded-full border border-line px-3 text-sm font-bold tabular-nums hover:border-accent"
              >
                {r.short}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-success">כל החדרים אישרו היום ✓</p>
        )}
      </section>

      <details className="card p-4">
        <summary className="cursor-pointer select-none font-extrabold">כל הפניות הפתוחות ({open.length})</summary>
        <ul className="mt-3 space-y-2">
          {open.map((t) => (
            <TicketCard key={t.id} d={d} t={t} showRoom />
          ))}
        </ul>
      </details>

      <details className="card p-4">
        <summary className="cursor-pointer select-none font-extrabold">טופלו לאחרונה</summary>
        <ul className="mt-3 space-y-2">
          {d.closed
            .filter((t) => inFloor(t.data.room))
            .slice(0, 40)
            .map((t) => (
              <TicketCard key={t.id} d={d} t={t} showRoom />
            ))}
        </ul>
      </details>
    </div>
  );
}
