import "server-only";
// "הוספת אפליקציה" suggestions (public.app_submissions). Server code only; the actions re-check roles.
import type { Db } from "./db-core";

export type SubmissionKind = "url" | "github";
export type SubmissionStatus = "pending" | "approved" | "rejected";
export interface Submission {
  id: string;
  kind: SubmissionKind;
  name: string;
  description: string;
  url: string;
  emoji: string;
  icon: string | null;
  status: SubmissionStatus;
  review_note: string | null;
  submitted_by: string | null;
  submitter_name: string | null;
  reviewer_name: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

const COLS = `s.id, s.kind, s.name, s.description, s.url, s.emoji, s.icon, s.status, s.review_note, s.submitted_by,
  p.full_name as submitter_name, r.full_name as reviewer_name, s.reviewed_at, s.created_at`;
const FROM = `public.app_submissions s
  left join public.profiles p on p.id = s.submitted_by
  left join public.profiles r on r.id = s.reviewed_by`;

export async function mySubmissions(db: Db, userId: string): Promise<Submission[]> {
  const { rows } = await db.query<Submission>(`select ${COLS} from ${FROM} where s.submitted_by = $1 order by s.created_at desc limit 30`, [userId]);
  return rows;
}

export async function submissionsByStatus(db: Db, status: SubmissionStatus, kind?: SubmissionKind): Promise<Submission[]> {
  const { rows } = await db.query<Submission>(
    `select ${COLS} from ${FROM} where s.status = $1 and ($2::text is null or s.kind = $2) order by ${status === "pending" ? "s.created_at asc" : "s.name asc"} limit 300`,
    [status, kind ?? null],
  );
  return rows;
}

/** Approved websites for the home grid. */
export async function approvedLinkApps(db: Db): Promise<Pick<Submission, "id" | "name" | "description" | "url" | "emoji" | "icon">[]> {
  const { rows } = await db.query<Submission>(
    "select id, name, description, url, emoji, icon from public.app_submissions where status = 'approved' and kind = 'url' order by name asc limit 100",
  );
  return rows;
}

export async function pendingSubmissionCount(db: Db): Promise<number> {
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.app_submissions where status = 'pending'");
  return rows[0]?.n ?? 0;
}
