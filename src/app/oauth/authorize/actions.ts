"use server";
// The consent screen's buttons. Everything is validated again here (never trust the hidden fields).
import { getSession } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { audit } from "@/platform/server/audit";
import { ConnectError, grantConsent, issueCode, validateAuthorize, withParams } from "@/platform/auth/connect";

export async function answerConsent(params: Record<string, string>, allow: boolean): Promise<{ url?: string; error?: string }> {
  const s = await getSession();
  if (!s || s.profile.status !== "approved") return { error: "צריך להתחבר מחדש." };
  const db = await getDb();
  try {
    const req = await validateAuthorize(db, params, s.profile.id);
    if (!allow) return { url: withParams(req.redirectUri, { error: "access_denied", state: req.state }) };
    await grantConsent(db, req.site.id, s.profile.id, req.site.directory_allowed);
    await audit(db, s.profile.id, "site.connect", req.site.id, { site: req.site.name, directory: req.site.directory_allowed });
    return { url: await issueCode(db, req, s.profile.id) };
  } catch (e) {
    if (e instanceof ConnectError) return { error: e.message };
    throw e;
  }
}
