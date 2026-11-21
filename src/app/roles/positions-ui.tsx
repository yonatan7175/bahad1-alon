// Positions (תפקידים) UI shared by /roles and /profile. Plain server-action forms (no client JS needed).
import { positionLabel, POSITION_SCOPE_LABEL, type MyPosition } from "@/platform/server/positions";
import { askPosition, dropPosition } from "./actions";

const STATUS = {
  pending: ["badge-warning", "ממתין לאישור מנהל"],
  approved: ["badge-accent", "מאושר"],
  rejected: ["badge-danger", "הבקשה נדחתה"],
} as const;

/**
 * One form: pick a position from the list, add a note, send. Lists only positions you can ask for now.
 * A פלוגתי position is asked for the user's own company (`company`); without a company it can't be asked.
 */
export function RequestPositionForm({ positions, company }: { positions: MyPosition[]; company: string | null }) {
  const open = positions.filter((p) => p.status === null || p.status === "rejected");
  if (open.length === 0) return <p className="text-sm text-muted">כבר ביקשת או קיבלת את כל התפקידים הקיימים.</p>;
  return (
    <form action={askPosition} className="grid gap-3" data-testid="position-form">
      <label className="block">
        <span className="label mt-0">תפקיד</span>
        <select name="position" required defaultValue="" className="field">
          <option value="" disabled>
            בחירת תפקיד…
          </option>
          {open.map((p) => {
            const blocked = p.scope === "company" && !company;
            const where = p.scope === "company" ? (company ? `פלוגתי — ${company}` : "פלוגתי — צריך שיוך לפלוגה") : "גדודי";
            return (
              <option key={p.id} value={p.id} disabled={blocked}>
                {`${p.name} (${where})${p.description ? ` — ${p.description}` : ""}`}
              </option>
            );
          })}
        </select>
      </label>
      <p className="-mt-1 text-xs text-subtle">
        תפקיד פלוגתי נרשם לפלוגה שלך{company ? ` (${company})` : ""} ומנהל רק אותה. תפקיד גדודי מנהל את כל הגדוד.
      </p>
      <label className="block">
        <span className="label mt-0">הערה למנהל (לא חובה)</span>
        <input name="reason" maxLength={200} placeholder="למשל: מונה/תי לתפקיד השבוע" className="field" />
      </label>
      <button type="submit" className="btn w-full sm:w-auto sm:justify-self-start">
        שליחת בקשה
      </button>
    </form>
  );
}

/** The positions you asked for or hold, with their status and what you can do. */
export function MyPositionsList({ positions }: { positions: MyPosition[] }) {
  const mine = positions.filter((p) => p.status !== null);
  if (mine.length === 0) return <p className="text-sm text-muted">אין לך תפקידים עדיין.</p>;
  return (
    <ul className="list-group" data-testid="my-positions">
      {mine.map((p) => (
        <li key={p.id} className="px-4 py-3" data-testid="position">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{positionLabel(p.name, p.companyName)}</span>
            <span className="badge-hidden">{POSITION_SCOPE_LABEL[p.scope]}</span>
            {p.status ? <span className={STATUS[p.status][0]}>{STATUS[p.status][1]}</span> : null}
          </div>
          {p.description ? <p className="mt-0.5 text-sm text-muted">{p.description}</p> : null}
          {p.status === "rejected" && p.reviewNote ? <p className="mt-1 text-sm text-danger">הערת המנהל: {p.reviewNote}</p> : null}
          {p.status === "rejected" ? <p className="mt-1 text-xs text-subtle">אפשר לבקש שוב בטופס.</p> : null}

          {p.status === "pending" ? (
            <form action={dropPosition} className="mt-2">
              <input type="hidden" name="position" value={p.id} />
              <button type="submit" className="btn-secondary">
                ביטול הבקשה
              </button>
            </form>
          ) : null}

          {p.status === "approved" ? (
            <details className="mt-1">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-muted hover:text-danger">ויתור על התפקיד…</summary>
              <form action={dropPosition} className="mt-1 flex flex-wrap items-center gap-2">
                <input type="hidden" name="position" value={p.id} />
                <span className="text-sm text-muted">כדי לקבל אותו שוב צריך אישור מחדש.</span>
                <button type="submit" className="btn-danger">
                  ויתור על {positionLabel(p.name, p.companyName)}
                </button>
              </form>
            </details>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
