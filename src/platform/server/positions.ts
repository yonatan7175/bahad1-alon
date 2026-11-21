// Positions (תפקידים, supabase/migrations/20261121000008_positions.sql): users request a position,
// an admin approves it. An approved holder manages the position's built-in apps (engine: actor.appManager).
// Callers check WHO may call (signed-in approved user / admin); this module checks everything else
// and writes the audit log.
import type { Db } from "./db-core";
import { audit } from "./audit";

export type HolderStatus = "pending" | "approved" | "rejected";
/** battalion = גדודי, company = פלוגתי (each holding is tied to one company). */
export type PositionScope = "battalion" | "company";

export const POSITION_SCOPE_LABEL: Record<PositionScope, string> = { battalion: "גדודי", company: "פלוגתי" };

/** 'קל"פ · פלוגה א'' for a פלוגתי holding, else just the name. */
export function positionLabel(name: string, companyName: string | null | undefined): string {
  return companyName ? `${name} · ${companyName}` : name;
}

export interface Position {
  id: string;
  name: string;
  description: string;
  scope: PositionScope;
  sort: number;
  apps: string[]; // app_ref: 'app:<slug>' | 'link:<id>'
}

export interface MyPosition extends Position {
  status: HolderStatus | null; // null = never asked
  companyName: string | null; // פלוגתי: the company this holding is for
  reason: string | null;
  reviewNote: string | null;
}

export interface Holder {
  positionId: string;
  profileId: string;
  name: string | null;
  email: string;
  companyId: string | null;
  companyName: string | null;
  status: HolderStatus;
  reason: string | null;
  reviewNote: string | null;
  requestedAt: Date;
}

export class PositionError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_REF = /^(app:[a-z0-9][a-z0-9-]{0,39}|link:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

function uuid(v: string): string {
  if (!UUID.test(v)) throw new PositionError("מזהה לא תקין");
  return v.toLowerCase();
}
function note(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().slice(0, 200);
  return s || null;
}

export const appRef = (slug: string) => `app:${slug}`;
export const linkRef = (id: string) => `link:${id}`;

export async function listPositions(db: Db): Promise<Position[]> {
  const { rows } = await db.query<{ id: string; name: string; description: string; scope: PositionScope; sort: number; apps: string[] | null }>(
    `select p.id, p.name, p.description, p.scope, p.sort,
            (select array_agg(a.app_ref order by a.app_ref) from public.position_apps a where a.position_id = p.id) as apps
       from public.positions p order by p.sort, p.name`,
  );
  return rows.map((r) => ({ ...r, apps: r.apps ?? [] }));
}

/** Every position, with this user's request status. */
export async function myPositions(db: Db, profileId: string): Promise<MyPosition[]> {
  const all = await listPositions(db);
  const { rows } = await db.query<{ position_id: string; status: HolderStatus; reason: string | null; review_note: string | null; company_name: string | null }>(
    `select h.position_id, h.status, h.reason, h.review_note, c.name as company_name
       from public.position_holders h left join public.companies c on c.id = h.company_id where h.profile_id = $1`,
    [profileId],
  );
  const mine = new Map(rows.map((r) => [r.position_id, r]));
  return all.map((p) => {
    const h = mine.get(p.id);
    return { ...p, status: h?.status ?? null, reason: h?.reason ?? null, reviewNote: h?.review_note ?? null, companyName: h?.company_name ?? null };
  });
}

/** Labels of the positions this user holds (approved only), e.g. ['קל"פ · פלוגה א'', 'קל"ג']. */
export async function heldPositionNames(db: Db, profileId: string): Promise<string[]> {
  const { rows } = await db.query<{ name: string; company_name: string | null }>(
    `select p.name, c.name as company_name from public.position_holders h join public.positions p on p.id = h.position_id
       left join public.companies c on c.id = h.company_id
      where h.profile_id = $1 and h.status = 'approved' order by p.sort, p.name`,
    [profileId],
  );
  return rows.map((r) => positionLabel(r.name, r.company_name));
}

/** SQL (alias p = profiles) for the same labels — used by the people directory. */
export const HELD_POSITIONS_SQL = `array(select ps.name || coalesce(' · ' || hc.name, '')
         from public.position_holders h join public.positions ps on ps.id = h.position_id
         left join public.companies hc on hc.id = h.company_id
        where h.profile_id = p.id and h.status = 'approved' order by ps.sort, ps.name)`;

export async function listHolders(db: Db): Promise<Holder[]> {
  const { rows } = await db.query<{
    position_id: string;
    profile_id: string;
    full_name: string | null;
    email: string;
    company_id: string | null;
    company_name: string | null;
    status: HolderStatus;
    reason: string | null;
    review_note: string | null;
    requested_at: Date;
  }>(
    `select h.position_id, h.profile_id, p.full_name, p.email, h.company_id, c.name as company_name, h.status, h.reason, h.review_note, h.requested_at
       from public.position_holders h join public.profiles p on p.id = h.profile_id
       left join public.companies c on c.id = h.company_id
      where h.status <> 'rejected' or h.reviewed_at > now() - interval '30 days'
      order by h.requested_at`,
  );
  return rows.map((r) => ({
    positionId: r.position_id,
    profileId: r.profile_id,
    name: r.full_name,
    email: r.email,
    companyId: r.company_id,
    companyName: r.company_name,
    status: r.status,
    reason: r.reason,
    reviewNote: r.review_note,
    requestedAt: r.requested_at,
  }));
}

export async function pendingPositionCount(db: Db): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from public.position_holders h join public.profiles p on p.id = h.profile_id
      where h.status = 'pending' and p.status = 'approved'`,
  );
  return rows[0]?.n ?? 0;
}

export interface AppManagement {
  /** Manages the whole app: app_managers, or an approved גדודי position. */
  all: boolean;
  /** Companies managed through approved פלוגתי positions. */
  companies: string[];
}

/** How this user manages this built-in app (engine: actor.appManager / actor.managerCompanyIds). */
export async function appManagement(db: Db, profileId: string, slug: string): Promise<AppManagement> {
  const { rows } = await db.query<{ company_id: string | null; whole: boolean }>(
    `select null::uuid as company_id, true as whole from public.app_managers where app_slug = $1 and profile_id = $2
     union all
     select h.company_id, ps.scope = 'battalion' as whole
       from public.position_holders h
       join public.positions ps on ps.id = h.position_id
       join public.position_apps a on a.position_id = h.position_id
      where h.profile_id = $2 and h.status = 'approved' and a.app_ref = 'app:' || $1`,
    [slug, profileId],
  );
  const companies = [...new Set(rows.filter((r) => !r.whole && r.company_id).map((r) => r.company_id!))];
  return { all: rows.some((r) => r.whole), companies };
}

/** The company a פלוגתי holding gets: the user's current company (error if they have none). */
async function holdingCompany(db: Db, positionId: string, profileId: string): Promise<string | null> {
  const { rows } = await db.query<{ scope: PositionScope; company_id: string | null }>(
    "select ps.scope, pr.company_id from public.positions ps, public.profiles pr where ps.id = $1 and pr.id = $2",
    [positionId, profileId],
  );
  if (!rows[0]) throw new PositionError("התפקיד לא קיים");
  if (rows[0].scope === "battalion") return null;
  if (!rows[0].company_id) throw new PositionError("תפקיד פלוגתי: צריך קודם שיוך לפלוגה (מנהל האתר מעדכן)");
  return rows[0].company_id;
}

// ── the user ──

/** Ask for a position (again after a rejection). Already pending/approved → nothing changes. */
export async function requestPosition(db: Db, profileId: string, positionId: string, reason?: string | null): Promise<"requested" | "unchanged"> {
  const pid = uuid(positionId);
  const company = await holdingCompany(db, pid, profileId);
  const { rows } = await db.query(
    `insert into public.position_holders (position_id, profile_id, reason, company_id) values ($1, $2, $3, $4)
     on conflict (position_id, profile_id) do update
       set status = 'pending', reason = excluded.reason, company_id = excluded.company_id, requested_at = now(),
           review_note = null, reviewed_by = null, reviewed_at = null
       where position_holders.status = 'rejected'
     returning 1`,
    [pid, profileId, note(reason), company],
  );
  if (!rows.length) return "unchanged";
  await audit(db, profileId, "position.request", profileId, { position: pid, company });
  return "requested";
}

/** Cancel a pending request, or give up a held position. */
export async function leavePosition(db: Db, profileId: string, positionId: string): Promise<void> {
  const pid = uuid(positionId);
  const { rows } = await db.query<{ status: HolderStatus }>(
    "delete from public.position_holders where position_id = $1 and profile_id = $2 and status in ('pending', 'approved') returning status",
    [pid, profileId],
  );
  if (rows.length) await audit(db, profileId, rows[0].status === "pending" ? "position.withdraw" : "position.leave", profileId, { position: pid });
}

// ── admins ──

export async function decidePosition(
  db: Db,
  adminId: string,
  positionId: string,
  profileId: string,
  decision: "approve" | "reject",
  reviewNote?: string | null,
): Promise<boolean> {
  const pid = uuid(positionId);
  const uid = uuid(profileId);
  const { rows } = await db.query(
    `update public.position_holders set status = $3, review_note = $4, reviewed_by = $5, reviewed_at = now()
      where position_id = $1 and profile_id = $2 and status = 'pending' returning 1`,
    [pid, uid, decision === "approve" ? "approved" : "rejected", note(reviewNote), adminId],
  );
  if (rows.length) await audit(db, adminId, decision === "approve" ? "position.approve" : "position.reject", uid, { position: pid });
  return rows.length > 0;
}

/** Give a position without a request (any earlier request/rejection becomes approved). */
export async function assignPosition(db: Db, adminId: string, positionId: string, profileId: string): Promise<void> {
  const pid = uuid(positionId);
  const uid = uuid(profileId);
  const ok = await db.query("select 1 from public.profiles where id = $1 and status = 'approved'", [uid]);
  if (!ok.rows.length) throw new PositionError("המשתמש לא נמצא או לא מאושר");
  const company = await holdingCompany(db, pid, uid);
  await db.query(
    `insert into public.position_holders (position_id, profile_id, company_id, status, reviewed_by, reviewed_at) values ($1, $2, $4, 'approved', $3, now())
     on conflict (position_id, profile_id) do update
       set status = 'approved', company_id = excluded.company_id, review_note = null, reviewed_by = $3, reviewed_at = now()`,
    [pid, uid, adminId, company],
  );
  await audit(db, adminId, "position.assign", uid, { position: pid, company });
}

export async function removeHolder(db: Db, adminId: string, positionId: string, profileId: string): Promise<void> {
  const pid = uuid(positionId);
  const uid = uuid(profileId);
  const { rows } = await db.query("delete from public.position_holders where position_id = $1 and profile_id = $2 returning 1", [pid, uid]);
  if (rows.length) await audit(db, adminId, "position.remove", uid, { position: pid });
}

function cleanName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.length < 1 || n.length > 30) throw new PositionError("שם התפקיד: 1–30 תווים");
  return n;
}

function cleanScope(scope: string): PositionScope {
  if (scope !== "battalion" && scope !== "company") throw new PositionError("יש לבחור פלוגתי או גדודי");
  return scope;
}

export async function createPosition(db: Db, adminId: string, name: string, description: string, scope: string = "battalion"): Promise<string> {
  const n = cleanName(name);
  const sc = cleanScope(scope);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.positions (name, description, scope, sort) values ($1, $2, $3, (select coalesce(max(sort), 0) + 1 from public.positions))
     on conflict (name) do nothing returning id`,
    [n, description.trim().slice(0, 200), sc],
  );
  if (!rows[0]) throw new PositionError("כבר יש תפקיד בשם הזה");
  await audit(db, adminId, "position.create", rows[0].id, { name: n });
  return rows[0].id;
}

/**
 * Changing גדודי → פלוגתי ties every holding to the holder's current company (holders without a company
 * keep the position but manage nothing until an admin re-appoints them); פלוגתי → גדודי drops the company.
 */
export async function updatePosition(
  db: Db,
  adminId: string,
  positionId: string,
  name: string,
  description: string,
  apps: string[],
  scope: string = "battalion",
): Promise<void> {
  const pid = uuid(positionId);
  const n = cleanName(name);
  const sc = cleanScope(scope);
  const refs = [...new Set(apps)];
  if (refs.some((r) => !APP_REF.test(r))) throw new PositionError("אפליקציה לא תקינה");
  await db.tx(async (t) => {
    const clash = await t.query("select 1 from public.positions where name = $1 and id <> $2", [n, pid]);
    if (clash.rows.length) throw new PositionError("כבר יש תפקיד בשם הזה");
    const { rows } = await t.query("update public.positions set name = $2, description = $3, scope = $4 where id = $1 returning 1", [
      pid,
      n,
      description.trim().slice(0, 200),
      sc,
    ]);
    if (!rows.length) throw new PositionError("התפקיד לא קיים");
    if (sc === "battalion") await t.query("update public.position_holders set company_id = null where position_id = $1", [pid]);
    else
      await t.query(
        `update public.position_holders h set company_id = pr.company_id from public.profiles pr
          where h.position_id = $1 and h.company_id is null and pr.id = h.profile_id`,
        [pid],
      );
    await t.query("delete from public.position_apps where position_id = $1", [pid]);
    for (const r of refs) await t.query("insert into public.position_apps (position_id, app_ref) values ($1, $2)", [pid, r]);
  });
  await audit(db, adminId, "position.update", pid, { name: n, scope: sc, apps: refs });
}

export async function deletePosition(db: Db, adminId: string, positionId: string): Promise<void> {
  const pid = uuid(positionId);
  const { rows } = await db.query<{ name: string }>("delete from public.positions where id = $1 returning name", [pid]);
  if (rows.length) await audit(db, adminId, "position.delete", pid, { name: rows[0].name });
}
