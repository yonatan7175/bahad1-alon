import "server-only";
import { BahadError } from "../errors";
import { getSession, type Session } from "../auth/session";
import { isSameOrigin } from "./http";

/** Portal (non-app) API routes: same-origin + approved user. */
export async function requireApiSession(req: Request): Promise<Session> {
  if (!isSameOrigin(req)) throw new BahadError("forbidden", "cross-origin request");
  const s = await getSession();
  if (!s) throw new BahadError("unauthorized", "not signed in");
  if (s.profile.status !== "approved") throw new BahadError("forbidden", "user is not approved");
  return s;
}
