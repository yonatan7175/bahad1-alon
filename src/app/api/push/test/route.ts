// "Send me a test notification" from /profile (Phase 4 done-when check).
import { after } from "next/server";
import { BahadError } from "@/platform/errors";
import { getDb } from "@/platform/server/db";
import { hit } from "@/platform/server/engine";
import { jsonError, readJson, sendPushNow } from "@/platform/server/http";
import { requireApiSession } from "@/platform/server/portal-api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const s = await requireApiSession(req);
    const body = (await readJson(req, 1024)) as { delaySeconds?: unknown };
    const delay = body?.delaySeconds === 60 ? 60 : 0;
    const db = await getDb();
    await hit(db, `p:portal-test:${s.profile.id}`, "day", 20, "test limit reached (20 per day)");
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.push_subscriptions where user_id = $1", [s.profile.id]);
    if (!rows[0]?.n) throw new BahadError("invalid", "notifications are not enabled on any device");
    await db.query(
      `insert into public.push_queue (batch_id, app_slug, sender_id, user_id, title, body, url, send_at)
       values (gen_random_uuid(), 'portal', $1, $1, 'התראת בדיקה', $2, '/profile', now() + make_interval(secs => $3))`,
      [s.profile.id, delay ? "נשלחה דקה אחרי הבקשה" : "ההתראות עובדות ✔", delay],
    );
    if (!delay) after(() => sendPushNow().catch((e) => console.error("[push] test send failed", e)));
    return Response.json({ ok: true, delaySeconds: delay });
  } catch (e) {
    return jsonError(e);
  }
}
