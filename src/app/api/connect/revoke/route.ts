// Sign out of a connected site: the token stops working at once. Only the token's own site
// (or its server) may revoke it; an already-invalid token is simply "done".
import { ConnectError, revokeToken, verifyToken } from "@/platform/auth/connect";
import { getDb } from "@/platform/server/db";
import { checkOrigin, preflight, respond } from "@/platform/server/connect-http";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function POST(req: Request) {
  return respond(req, async () => {
    const db = await getDb();
    const auth = req.headers.get("authorization");
    let origin: string | null = null;
    try {
      origin = checkOrigin(req, await verifyToken(db, auth));
    } catch (e) {
      if (!(e instanceof ConnectError) || e.code !== "invalid_token") throw e;
      return { body: { ok: true }, origin: null };
    }
    await revokeToken(db, auth);
    return { body: { ok: true }, origin };
  });
}
