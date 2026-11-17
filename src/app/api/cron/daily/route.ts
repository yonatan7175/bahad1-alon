// Daily housekeeping: deletes sent push rows older than 30 days and old rate-limit counters.
import { cronAuthorized, jsonError } from "@/platform/server/http";
import { getDb } from "@/platform/server/db";
import { dailyCleanup } from "@/platform/server/push";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: { code: "unauthorized", message: "bad cron secret" } }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await dailyCleanup(await getDb())) });
  } catch (e) {
    return jsonError(e);
  }
}

export const GET = handle;
export const POST = handle;
