// Public health check. Touches the database, so a daily ping also keeps a free
// Supabase project from pausing (plan 12 — Risks).
import { getDb } from "@/platform/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.query("select 1");
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[health]", e);
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
