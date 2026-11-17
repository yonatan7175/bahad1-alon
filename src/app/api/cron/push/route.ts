// Called every minute (pg_cron + pg_net on Supabase, a systemd timer on Linux).
// Sends due push_queue rows. Requires the CRON_SECRET.
import { cronAuthorized, jsonError, sendPushNow } from "@/platform/server/http";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: { code: "unauthorized", message: "bad cron secret" } }, { status: 401 });
  try {
    const result = await sendPushNow();
    if (!result) return Response.json({ error: { code: "invalid", message: "VAPID keys are not configured" } }, { status: 500 });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return jsonError(e);
  }
}

export const GET = handle;
export const POST = handle;
