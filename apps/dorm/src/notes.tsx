"use client";
// "הערות מהמסדר האחרון" — one shared text per room. The room's members, the logistics officer and
// admins can edit it (server rule: ownRoom, moderators any room). Every save adds a new version
// (no one overwrites someone else's record); the newest version is the room's note, older ones are history.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, History, Pencil, Save, X } from "lucide-react";
import { useBahad, type BahadRecord } from "@/platform/client";
import { ago } from "./data";

export type Note = { room: string; text: string };

const HISTORY = 6;

export function useRoomNotes(room: string, collection: "notes" | "area_notes" = "notes") {
  const bahad = useBahad();
  const notes = useMemo(() => bahad.data.collection<Note>(collection), [bahad, collection]);
  const [list, setList] = useState<BahadRecord<Note>[] | null>(null);
  const load = useCallback(async () => setList(await notes.list({ where: { room }, order: "createdAt:desc", limit: HISTORY })), [notes, room]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async: state is set after the fetch resolves
    load().catch(() => setList([]));
    return notes.subscribe(() => void load().catch(() => {}));
  }, [notes, load]);
  const save = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await notes.add({ room, text: text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 600) });
        await load();
        bahad.ui.toast("ההערות נשמרו");
        return true;
      } catch {
        bahad.ui.toast("לא הצלחנו לשמור את ההערות");
        return false;
      }
    },
    [notes, room, load, bahad],
  );
  return { list, save };
}

/** Toilets / lobby: a morning-inspection summary that EVERYONE can write (collection "area_notes"). */
export function AreaNotes({ room }: { room: string }) {
  return (
    <RoomNotes
      room={room}
      canEdit
      collection="area_notes"
      title="סיכום מסדר הבוקר"
      who="כל אחד יכול לכתוב ולעדכן"
      placeholder={"למשל:\n• כיור 2 סתום\n• חסר נייר בתא האחרון\n• הרצפה נוקתה ✓"}
    />
  );
}

export function RoomNotes({
  room,
  canEdit,
  collection = "notes",
  title = "הערות מהמסדר האחרון",
  who = "כל חברי החדר והקל\"ג רואים ויכולים לערוך",
  placeholder = "למשל:\n• אבק על הארונות\n• מיטה ליד החלון לא מסודרת\n• לרוקן פח לפני המסדר הבא",
}: {
  room: string;
  canEdit: boolean;
  collection?: "notes" | "area_notes";
  title?: string;
  who?: string;
  placeholder?: string;
}) {
  const { list, save } = useRoomNotes(room, collection);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const cur = list?.[0];
  const hasText = !!cur?.data.text;

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-[var(--shadow-sm)]" aria-labelledby={`notes-${room}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={`notes-${room}`} className="flex items-center gap-2 text-lg font-extrabold">
          <ClipboardList className="size-5 text-accent" aria-hidden="true" /> {title}
        </h2>
        {canEdit && !editing && list ? (
          <button
            type="button"
            className="btn-secondary min-h-11"
            onClick={() => {
              setText(cur?.data.text ?? "");
              setEditing(true);
            }}
          >
            <Pencil className="size-4" aria-hidden="true" /> {hasText ? "עריכה" : "הוספה"}
          </button>
        ) : null}
      </div>

      {list === null ? (
        <div className="mt-3 h-12 animate-pulse rounded-ctl bg-surface-2" aria-label="טוען" />
      ) : editing ? (
        <form
          className="mt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const ok = await save(text);
            setBusy(false);
            if (ok) setEditing(false);
          }}
        >
          <label className="sr-only" htmlFor={`notes-text-${room}`}>
            {title}
          </label>
          <textarea
            id={`notes-text-${room}`}
            className="field min-h-32"
            maxLength={600}
            autoFocus
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted">
            {text.length}/600 · {who}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="submit" className="btn min-h-12 flex-1" disabled={busy || text.trim() === (cur?.data.text ?? "")}>
              <Save className="size-4" aria-hidden="true" /> שמירה
            </button>
            <button type="button" className="btn-ghost min-h-12" onClick={() => setEditing(false)}>
              <X className="size-4" aria-hidden="true" /> ביטול
            </button>
          </div>
        </form>
      ) : hasText ? (
        <>
          <p className="mt-3 whitespace-pre-wrap break-words rounded-ctl bg-surface-2 p-3 text-sm leading-relaxed">{cur!.data.text}</p>
          <p className="mt-1.5 text-xs text-muted">
            עודכן {cur!.mine ? "על ידך" : `ע״י ${cur!.owner.name}`} · {ago(cur!.createdAt)}
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-ctl border border-dashed border-line p-3 text-center text-sm text-muted">
          {cur ? "ההערות נמחקו — אין הערות פתוחות." : collection === "area_notes" ? "עוד לא נכתב סיכום." : "עוד לא נכתבו הערות לחדר."}
          {canEdit ? " אחרי המסדר — כתבו כאן מה צריך לתקן." : ""}
        </p>
      )}

      {!editing && list && list.length > 1 ? (
        <details className="mt-3">
          <summary className="flex cursor-pointer select-none items-center gap-1.5 text-sm font-semibold text-muted">
            <History className="size-4" aria-hidden="true" /> גרסאות קודמות ({list.length - 1})
          </summary>
          <ul className="mt-2 space-y-2">
            {list.slice(1).map((n) => (
              <li key={n.id} className="rounded-ctl border border-line p-2.5 text-sm opacity-80">
                <p className="whitespace-pre-wrap break-words">{n.data.text || "(ריק)"}</p>
                <p className="mt-1 text-xs text-muted">
                  {n.mine ? "את/ה" : n.owner.name} · {ago(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
