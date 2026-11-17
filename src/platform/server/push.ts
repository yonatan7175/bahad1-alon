// Web Push: device subscriptions, and the sender that drains push_queue.
// Called every minute by /api/cron/push (pg_cron on Supabase, a systemd timer on Linux,
// or the in-process timer when BAHAD_INTERNAL_CRON=1).
import type { Db } from "./db-core";

export interface PushPayload {
  title: string;
  body: string | null;
  url: string | null;
  app: string;
}

export interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Sends one notification. Resolves with the push service's HTTP status code. */
export type PushSender = (sub: Subscription, payload: PushPayload) => Promise<number>;

export interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export async function webPushSender(vapid: Vapid): Promise<PushSender> {
  const webpush = (await import("web-push")).default;
  return async (sub, payload) => {
    try {
      const res = await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 6 * 3600, urgency: "high", vapidDetails: vapid, timeout: 10_000 },
      );
      return res.statusCode;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (typeof status === "number") return status;
      throw e;
    }
  };
}

const ENDPOINT_RE = /^https:\/\/[^\s]{1,2000}$/;
const KEY_RE = /^[A-Za-z0-9_-]{8,200}={0,2}$/;

export function validSubscription(s: unknown): s is Subscription {
  const x = s as Subscription;
  return (
    typeof x === "object" &&
    x !== null &&
    typeof x.endpoint === "string" &&
    ENDPOINT_RE.test(x.endpoint) &&
    typeof x.p256dh === "string" &&
    KEY_RE.test(x.p256dh) &&
    typeof x.auth === "string" &&
    KEY_RE.test(x.auth)
  );
}

export async function saveSubscription(db: Db, userId: string, s: Subscription, userAgent: string | null) {
  // One row per device endpoint. If the device changes hands, the newest signed-in user owns it.
  await db.query(
    `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update
       set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
           user_agent = excluded.user_agent, created_at = now()`,
    [userId, s.endpoint, s.p256dh, s.auth, userAgent?.slice(0, 300) ?? null],
  );
}

export async function deleteSubscription(db: Db, userId: string, endpoint: string) {
  await db.query("delete from public.push_subscriptions where user_id = $1 and endpoint = $2", [userId, endpoint]);
}

export interface SendResult {
  claimed: number;
  delivered: number;
  failed: number;
  removedSubscriptions: number;
}

/**
 * Claims due rows (at-most-once: a row is marked sent before delivery, so two
 * concurrent senders never double-send) and delivers them to every device of the user.
 */
export async function sendDuePush(db: Db, send: PushSender, batch = 200): Promise<SendResult> {
  const { rows } = await db.query<{ id: string; user_id: string; title: string; body: string | null; url: string | null; app_slug: string }>(
    `update public.push_queue set sent_at = now()
      where id in (select id from public.push_queue
                    where sent_at is null and send_at <= now()
                    order by send_at limit $1
                    for update skip locked)
      returning id, user_id, title, body, url, app_slug`,
    [batch],
  );
  const result: SendResult = { claimed: rows.length, delivered: 0, failed: 0, removedSubscriptions: 0 };
  const subsCache = new Map<string, (Subscription & { id: string })[]>();
  for (const row of rows) {
    let subs = subsCache.get(row.user_id);
    if (!subs) {
      subs = (
        await db.query<Subscription & { id: string }>(
          "select id, endpoint, p256dh, auth from public.push_subscriptions where user_id = $1",
          [row.user_id],
        )
      ).rows;
      subsCache.set(row.user_id, subs);
    }
    if (subs.length === 0) {
      result.failed++;
      await db.query("update public.push_queue set error = 'no_subscription' where id = $1", [row.id]);
      continue;
    }
    const errors: string[] = [];
    let ok = 0;
    for (const sub of [...subs]) {
      try {
        const status = await send(sub, { title: row.title, body: row.body, url: row.url, app: row.app_slug });
        if (status >= 200 && status < 300) ok++;
        else if (status === 404 || status === 410) {
          // Expired / unsubscribed device.
          await db.query("delete from public.push_subscriptions where id = $1", [sub.id]);
          subs.splice(subs.indexOf(sub), 1);
          result.removedSubscriptions++;
          errors.push(`gone:${status}`);
        } else errors.push(`http:${status}`);
      } catch (e) {
        errors.push(`error:${(e as Error).message?.slice(0, 80) ?? "unknown"}`);
      }
    }
    if (ok > 0) result.delivered++;
    else result.failed++;
    if (errors.length) {
      await db.query("update public.push_queue set error = $2 where id = $1", [row.id, errors.join(", ").slice(0, 500)]);
    }
  }
  return result;
}

/** Daily housekeeping (plan 06 — Scheduled jobs). */
export async function dailyCleanup(db: Db) {
  const a = await db.query<{ n: number }>(
    "with d as (delete from public.push_queue where sent_at is not null and sent_at < now() - interval '30 days' returning 1) select count(*)::int as n from d",
  );
  const b = await db.query<{ n: number }>(
    "with d as (delete from public.rate_counters where window_start < now() - interval '2 days' returning 1) select count(*)::int as n from d",
  );
  return { pushRowsDeleted: a.rows[0]?.n ?? 0, counterRowsDeleted: b.rows[0]?.n ?? 0 };
}
