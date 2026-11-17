import { BahadError } from "@/platform/errors";
import { getDb } from "@/platform/server/db";
import { jsonError, readJson } from "@/platform/server/http";
import { requireApiSession } from "@/platform/server/portal-api";
import { saveSubscription, validSubscription } from "@/platform/server/push";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const s = await requireApiSession(req);
    const body = (await readJson(req, 8 * 1024)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    const sub = { endpoint: body?.endpoint, p256dh: body?.keys?.p256dh, auth: body?.keys?.auth };
    if (!validSubscription(sub)) throw new BahadError("invalid", "invalid push subscription");
    await saveSubscription(await getDb(), s.profile.id, sub, req.headers.get("user-agent"));
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
