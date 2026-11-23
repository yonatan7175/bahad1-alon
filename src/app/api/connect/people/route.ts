// The battalion directory, for a connected site the קב״מית allowed to read it. Every read is
// written to the audit log (which site, for whom), so it's always visible who pulled the list.
import { directory, verifyToken } from "@/platform/auth/connect";
import { getDb } from "@/platform/server/db";
import { audit } from "@/platform/server/audit";
import { checkOrigin, preflight, rateLimit, respond } from "@/platform/server/connect-http";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: Request) {
  return respond(req, async () => {
    const db = await getDb();
    const t = await verifyToken(db, req.headers.get("authorization"));
    const origin = checkOrigin(req, t);
    await rateLimit(`people:${t.site.id}:${t.userId}`, 30);
    const people = await directory(db, t);
    await audit(db, t.userId, "site.directory_read", t.site.id, { site: t.site.name, count: people.length, server: !origin });
    return { body: { people }, origin };
  });
}
