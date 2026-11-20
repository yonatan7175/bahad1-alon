import "server-only";
// "שינויים ושיפורים" (public.feedback). Server code only; the page's actions re-check roles.
import type { Db } from "./db-core";

export type FeedbackKind = "idea" | "bug" | "complaint" | "other";
export interface Feedback {
  id: string;
  kind: FeedbackKind;
  body: string;
  status: "open" | "done";
  reply: string | null;
  author_id: string | null;
  author_name: string | null;
  author_unit: string | null;
  handler_name: string | null;
  handled_at: Date | null;
  created_at: Date;
}

const COLS = `f.id, f.kind, f.body, f.status, f.reply, f.author_id, a.full_name as author_name,
  nullif(concat_ws(' · ', c.name, pl.name), '') as author_unit, h.full_name as handler_name, f.handled_at, f.created_at`;
const FROM = `public.feedback f
  left join public.profiles a on a.id = f.author_id
  left join public.companies c on c.id = a.company_id
  left join public.platoons pl on pl.id = a.platoon_id
  left join public.profiles h on h.id = f.handled_by`;

export async function myFeedback(db: Db, userId: string): Promise<Feedback[]> {
  const { rows } = await db.query<Feedback>(`select ${COLS} from ${FROM} where f.author_id = $1 order by f.created_at desc limit 50`, [userId]);
  return rows;
}

export async function allFeedback(db: Db, status: "open" | "done"): Promise<Feedback[]> {
  const { rows } = await db.query<Feedback>(
    `select ${COLS} from ${FROM} where f.status = $1 order by ${status === "open" ? "f.created_at asc" : "f.handled_at desc nulls last"} limit 300`,
    [status],
  );
  return rows;
}

export async function openFeedbackCount(db: Db): Promise<number> {
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.feedback where status = 'open'");
  return rows[0]?.n ?? 0;
}
