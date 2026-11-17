import { BahadError } from "@/platform/errors";
import { getDb } from "@/platform/server/db";
import { jsonError, readJson } from "@/platform/server/http";
import { requireApiSession } from "@/platform/server/portal-api";
import { deleteSubscription } from "@/platform/server/push";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const s = await requireApiSession(req);
    const body = (await readJson(req, 8 * 1024)) as { endpoint?: unknown };
    if (typeof body?.endpoint !== "string") throw new BahadError("invalid", "endpoint is required");
    await deleteSubscription(await getDb(), s.profile.id, body.endpoint);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
