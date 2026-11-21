import "server-only";
// "הוספת אפליקציה" suggestions (public.app_submissions). Server code only; the actions re-check roles.
import type { Db } from "./db-core";
import type { EmbedMode } from "@/lib/embed";
import { probeEmbed, type ProbeResult } from "./embed-probe";

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
  embed_url: string | null;
  embed_note: string | null;
  embed_checked_at: Date | null;
  embed_mode: EmbedMode;
  review_note: string | null;
  submitted_by: string | null;
  submitter_name: string | null;
  reviewer_name: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

const COLS = `s.id, s.kind, s.name, s.description, s.url, s.emoji, s.icon, s.status, s.embed_url, s.embed_note, s.embed_checked_at, s.embed_mode, s.review_note, s.submitted_by,
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

export type LinkApp = Pick<Submission, "id" | "name" | "description" | "url" | "emoji" | "icon" | "embed_url" | "embed_note" | "embed_mode" | "submitter_name">;
const LINK_COLS = "s.id, s.name, s.description, s.url, s.emoji, s.icon, s.embed_url, s.embed_note, s.embed_mode, p.full_name as submitter_name";

/** Approved websites for the home grid. */
export async function approvedLinkApps(db: Db): Promise<LinkApp[]> {
  const { rows } = await db.query<LinkApp>(
    `select ${LINK_COLS} from ${FROM} where s.status = 'approved' and s.kind = 'url' order by s.name asc limit 100`,
  );
  return rows;
}

/** One approved website (for its in-portal page), or null. */
export async function approvedLinkApp(db: Db, id: string): Promise<LinkApp | null> {
  const { rows } = await db.query<LinkApp>(`select ${LINK_COLS} from ${FROM} where s.id = $1 and s.status = 'approved' and s.kind = 'url'`, [id]);
  return rows[0] ?? null;
}

/** Probes a website and stores whether it can open inside the portal. */
export async function recordEmbedProbe(db: Db, id: string, url: string): Promise<ProbeResult> {
  const r = await probeEmbed(url);
  await db.query("update public.app_submissions set embed_url = $2, embed_note = $3, embed_checked_at = now() where id = $1", [id, r.embedUrl, r.note.slice(0, 200)]);
  return r;
}

export async function pendingSubmissionCount(db: Db): Promise<number> {
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.app_submissions where status = 'pending'");
  return rows[0]?.n ?? 0;
}
