"use client";
// One request, with the actions the viewer may take:
// opener → withdraw · roommates → +1 · manager → in progress / reply / close / reopen.
import { useState } from "react";
import { Check, MessageSquareReply, RotateCcw, ThumbsUp, Trash2, Wrench } from "lucide-react";
import { areaById } from "./building";
import { itemById, STATUS_LABEL } from "./items";
import { ago, hhmm, type Dorm, type TicketRec } from "./data";

export function StatusBadge({ status }: { status: TicketRec["data"]["status"] }) {
  const cls = status === "closed" ? "badge-accent" : status === "in_progress" ? "badge-warning" : "badge-danger";
  return <span className={cls}>{STATUS_LABEL[status]}</span>;
}

export function TicketCard({ d, t, showRoom = false }: { d: Dorm; t: TicketRec; showRoom?: boolean }) {
  const item = itemById(t.data.item)!;
  const area = areaById(t.data.room);
  const plus = d.plusBy.get(t.id) ?? [];
  const iPlussed = plus.some((p) => p.mine);
  const isOpen = t.data.status !== "closed";
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState(t.data.reply ?? "");
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await f();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-ctl border border-line bg-surface p-3 shadow-[var(--shadow-sm)]">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-ctl bg-surface-2 text-2xl" aria-hidden="true">
          {item.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-bold">{item.label}</p>
            {showRoom && area ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold tabular-nums">{area.short}</span> : null}
            <StatusBadge status={t.data.status} />
            {plus.length ? (
              <span className="flex items-center gap-1 text-xs font-bold text-gold" title="עוד אנשים דיווחו על זה">
                <ThumbsUp className="size-3.5" aria-hidden="true" />+{plus.length}
              </span>
            ) : null}
          </div>
          {t.data.note ? <p className="mt-1 whitespace-pre-wrap break-words text-sm">{t.data.note}</p> : null}
          <p className="mt-1 text-xs text-muted">
            {t.mine ? "את/ה דיווחת" : t.owner.name} · {ago(t.createdAt)}
            {t.data.status === "closed" && t.data.closedAt ? ` · טופלה ${ago(t.data.closedAt)}` : ""}
            {t.data.status === "in_progress" && t.data.handledBy ? ` · ${t.data.handledBy} מטפל/ת` : ""}
          </p>
          {t.data.reply ? (
            <p className="mt-2 rounded-ctl bg-accent-soft px-3 py-2 text-sm text-accent-ink">
              <span className="font-bold">קל&quot;ג{t.data.handledBy ? ` (${t.data.handledBy})` : ""}: </span>
              {t.data.reply}
            </p>
          ) : null}
        </div>
      </div>

      {isOpen ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {!t.mine && !d.isManager ? (
            <button
              type="button"
              className={iPlussed ? "btn-secondary min-h-11" : "btn-ghost min-h-11 border border-line"}
              aria-pressed={iPlussed}
              disabled={busy}
              onClick={() => run(() => (iPlussed ? d.removePlus(t) : d.addPlus(t)))}
            >
              <ThumbsUp className="size-4" aria-hidden="true" />
              {iPlussed ? "סימנת +1" : "+1 גם אצלי"}
            </button>
          ) : null}
          {t.mine && t.data.status === "open" && !t.data.reply ? (
            <button type="button" className="btn-ghost min-h-11 text-muted" disabled={busy} onClick={() => run(() => d.withdraw(t))}>
              <Trash2 className="size-4" aria-hidden="true" />
              ביטול הפנייה
            </button>
          ) : null}
          {d.isManager ? (
            <>
              <button type="button" className="btn min-h-11" disabled={busy} onClick={() => run(() => d.closeMany([t]))}>
                <Check className="size-4" aria-hidden="true" />
                טופל — סגירה
              </button>
              {t.data.status === "open" ? (
                <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={() => run(() => d.setStatus(t, "in_progress"))}>
                  <Wrench className="size-4" aria-hidden="true" />
                  בטיפול
                </button>
              ) : (
                <button type="button" className="btn-ghost min-h-11" disabled={busy} onClick={() => run(() => d.setStatus(t, "open"))}>
                  החזרה לפתוחה
                </button>
              )}
              <button type="button" className="btn-ghost min-h-11" aria-expanded={replying} onClick={() => setReplying((v) => !v)}>
                <MessageSquareReply className="size-4" aria-hidden="true" />
                תגובה
              </button>
            </>
          ) : null}
        </div>
      ) : d.isManager ? (
        <div className="mt-3">
          <button type="button" className="btn-ghost min-h-11" disabled={busy} onClick={() => run(() => d.reopen(t))}>
            <RotateCcw className="size-4" aria-hidden="true" />
            פתיחה מחדש
          </button>
        </div>
      ) : null}

      {replying ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (await d.setReply(t, reply)) setReplying(false);
            });
          }}
        >
          <label htmlFor={`reply-${t.id}`} className="sr-only">
            תגובה לפנייה
          </label>
          <input
            id={`reply-${t.id}`}
            className="field"
            maxLength={200}
            placeholder="למשל: מגיע מחר בבוקר"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn shrink-0" disabled={busy}>
            שמירה
          </button>
        </form>
      ) : null}
      {t.data.status === "closed" && t.data.closedAt ? <span className="sr-only">נסגרה בשעה {hhmm(t.data.closedAt)}</span> : null}
    </li>
  );
}
