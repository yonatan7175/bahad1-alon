// The signed-in user, for a connected site (browser or the site's own server).
// A site's server must call this with the token it received — never trust a user id sent by a browser.
import { userInfo, verifyToken } from "@/platform/auth/connect";
import { getDb } from "@/platform/server/db";
import { checkOrigin, preflight, rateLimit, respond } from "@/platform/server/connect-http";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: Request) {
  return respond(req, async () => {
    const db = await getDb();
    const t = await verifyToken(db, req.headers.get("authorization"));
    const origin = checkOrigin(req, t);
    await rateLimit(`userinfo:${t.site.id}:${t.userId}`, 120);
    return { body: await userInfo(db, t), origin };
  });
}
