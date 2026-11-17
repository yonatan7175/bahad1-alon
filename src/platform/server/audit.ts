import type { Db } from "./db-core";

/** Every approval, role/unit change, block and app override is written here (plan 03). */
export async function audit(db: Db, actorId: string | null, action: string, target: string | null, details?: object) {
  await db.query("insert into public.audit_log (actor_id, action, target, details) values ($1, $2, $3, $4::jsonb)", [
    actorId,
    action,
    target,
    details ? JSON.stringify(details) : null,
  ]);
}
