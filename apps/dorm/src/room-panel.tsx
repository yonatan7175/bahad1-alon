"use client";
// Everything about one room/area: daily confirmation, quick report (2 taps), open requests, recent history.
import { useState } from "react";
import { ArrowRight, CheckCircle2, Send, ShieldCheck, Undo2 } from "lucide-react";
import { areaById } from "./building";
import { GROUP_LABEL, ITEMS, type Group, type Item } from "./items";
import { hhmm, type Dorm } from "./data";
import { TicketCard } from "./ticket-card";
import { RoomNotes } from "./notes";

export function DailyConfirm({ d, room, isMine }: { d: Dorm; room: string; isMine: boolean }) {
  const check = d.checkByRoom.get(room);
  const open = d.openByRoom.get(room) ?? [];
  const [busy, setBusy] = useState(false);
  if (check) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-success/30 bg-success-soft p-4 text-success">
        <CheckCircle2 className="size-8 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">החדר אושר היום</p>
          <p className="text-sm opacity-90">
            {check.mine ? "את/ה אישרת" : `${check.owner.name} אישר/ה`} בשעה {hhmm(check.createdAt)}
          </p>
        </div>
        {check.mine || d.isManager ? (
          <button type="button" className="icon-btn" aria-label="ביטול האישור של היום" onClick={() => void d.undoConfirm(check)}>
            <Undo2 className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );
  }
  if (!isMine && !d.isManager) {
    return <p className="rounded-ctl border border-line bg-surface-2 px-3 py-2 text-sm text-muted">החדר עוד לא אישר היום.</p>;
  }
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-[var(--shadow)]">
      <div className="bg-[image:var(--hero)] px-4 py-3 text-[color:var(--hero-text)]">
        <p className="flex items-center gap-2 font-extrabold">
          <ShieldCheck className="size-5" aria-hidden="true" /> אישור יומי לחדר {room}
        </p>
        <p className="mt-0.5 text-sm opacity-90">פעם ביום, מספיק אחד מהחדר: מאשרים שכל התקלות טופלו ושהחדר מסודר.</p>
      </div>
      <div className="p-4">
        {open.length ? (
          <p className="mb-3 rounded-ctl bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
            יש לחדר {open.length === 1 ? "פנייה פתוחה אחת" : `${open.length} פניות פתוחות`}. מאשרים רק אם הכול באמת טופל — הקל&quot;ג יסגור אותן.
          </p>
        ) : null}
        <button
          type="button"
          className="btn min-h-14 w-full text-base"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await d.confirmRoom(room);
            setBusy(false);
          }}
        >
          <CheckCircle2 className="size-5" aria-hidden="true" />
          הכול תקין — כל התקלות טופלו
        </button>
      </div>
    </div>
  );
}

export function QuickReport({ d, room }: { d: Dorm; room: string }) {
  const [pick, setPick] = useState<Item | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const area = areaById(room);
  const groups: Group[] = ["supply", "equipment", "fault"];
  const items = area?.kind === "room" ? ITEMS : ITEMS.filter((i) => i.id !== "bucket" && i.id !== "mop");

  if (pick) {
    const existing = pick.repeatable ? undefined : d.findOpen(room, pick.id);
    return (
      <div className="animate-rise">
        <button type="button" className="btn-ghost -ms-2 mb-2 min-h-11" onClick={() => setPick(null)}>
          <ArrowRight className="size-4" aria-hidden="true" /> חזרה
        </button>
        <p className="mb-3 flex items-center gap-2 text-lg font-extrabold">
          <span className="text-3xl" aria-hidden="true">
            {pick.emoji}
          </span>
          {pick.label} · {area?.short}
        </p>
        {existing ? (
          <>
            <p className="mb-2 text-sm text-muted">כבר יש פנייה פתוחה על זה — אין צורך לפתוח חדשה. אפשר לסמן +1:</p>
            <ul>
              <TicketCard d={d} t={existing} />
            </ul>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const ok = await d.report(room, pick.id, note);
              setBusy(false);
              if (ok) {
                setPick(null);
                setNote("");
              }
            }}
          >
            <label className="label" htmlFor="note">
              {pick.needsNote ? (pick.group === "fault" ? "מה התקלה? כתבו בחופשיות" : "מה חסר? כתבו בחופשיות") : "הערה (לא חובה)"}
            </label>
            <textarea
              id="note"
              className="field min-h-20"
              maxLength={200}
              required={pick.needsNote}
              minLength={pick.needsNote ? 2 : undefined}
              placeholder={pick.needsNote ? (pick.group === "fault" ? "למשל: הברז בכיור דולף, הדלת לא ננעלת" : "למשל: סבון ידיים, מטאטא, כיסוי למזרן") : pick.group === "fault" ? "למשל: המנורה ליד החלון" : "למשל: נגמר לגמרי"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="submit" className="btn mt-3 min-h-12 w-full" disabled={busy}>
              <Send className="size-4" aria-hidden="true" /> שליחה לקל&quot;ג
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const list = items.filter((i) => i.group === g);
        if (!list.length) return null;
        return (
          <div key={g}>
            <p className="section-title mb-2">{GROUP_LABEL[g]}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {list.map((i) => {
                const ex = i.repeatable ? undefined : d.findOpen(room, i.id);
                const plus = ex ? (d.plusBy.get(ex.id) ?? []).length : 0;
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => {
                      setNote("");
                      setPick(i);
                    }}
                    className={`relative flex min-h-[84px] flex-col items-center justify-center gap-1 rounded-card border-2 p-2 text-center shadow-[var(--shadow-sm)] transition-all active:scale-95 ${
                      ex
                        ? i.group === "fault"
                          ? "border-danger/40 bg-danger-soft"
                          : "border-warning/40 bg-warning-soft"
                        : "border-line bg-surface hover:border-accent/50"
                    }`}
                  >
                    <span className="text-3xl leading-none" aria-hidden="true">
                      {i.emoji}
                    </span>
                    <span className="text-sm font-bold">{i.label}</span>
                    {ex ? (
                      <span className="text-[11px] font-semibold text-muted">
                        דווח · {ex.data.status === "in_progress" ? "בטיפול" : "ממתין"}
                        {plus ? ` · +${plus}` : ""}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Room details (the map's sheet, and the "my room" tab). */
/** hideConfirm: the "my room" tab already shows the confirmation and the report grid above. */
export function RoomDetails({ d, room, isMine, hideConfirm = false }: { d: Dorm; room: string; isMine: boolean; hideConfirm?: boolean }) {
  const open = d.openByRoom.get(room) ?? [];
  const closed = d.closed.filter((t) => t.data.room === room).slice(0, 5);
  const [reporting, setReporting] = useState(false);
  const area = areaById(room);
  return (
    <div className="space-y-4">
      {area?.kind === "room" && !hideConfirm ? (
        <>
          <DailyConfirm d={d} room={room} isMine={isMine} />
          <RoomNotes room={room} canEdit={isMine || d.isManager} />
        </>
      ) : null}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="section-title">פניות פתוחות ({open.length})</p>
          {hideConfirm ? null : (
            <button type="button" className="btn-secondary min-h-11" aria-expanded={reporting} onClick={() => setReporting((v) => !v)}>
              {reporting ? "סגירת הדיווח" : "+ דיווח חדש"}
            </button>
          )}
        </div>
        {reporting ? (
          <div className="mb-3 rounded-card border border-line bg-bg-elevated p-3">
            <QuickReport d={d} room={room} />
          </div>
        ) : null}
        {open.length ? (
          <ul className="space-y-2">
            {open.map((t) => (
              <TicketCard key={t.id} d={d} t={t} />
            ))}
          </ul>
        ) : (
          <p className="rounded-ctl border border-dashed border-line p-4 text-center text-sm text-muted">אין פניות פתוחות 🎉</p>
        )}
      </div>
      {closed.length ? (
        <details className="group">
          <summary className="cursor-pointer select-none text-sm font-semibold text-muted">טופלו לאחרונה ({closed.length})</summary>
          <ul className="mt-2 space-y-2 opacity-80">
            {closed.map((t) => (
              <TicketCard key={t.id} d={d} t={t} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
