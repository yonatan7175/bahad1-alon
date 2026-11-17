// The Platform API endpoint. Body: { app, method, params }.
// `app` is supplied by PORTAL code only: the simple-app host page (from its URL)
// or a full app's route binding — never by app code inside the sandbox.
import { BahadError } from "@/platform/errors";
import { getAuthUser } from "@/platform/auth";
import { executeCall } from "@/platform/server/engine";
import { engineDeps, isSameOrigin, jsonError, readJson } from "@/platform/server/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new BahadError("forbidden", "cross-origin request");
    const body = await readJson(req, 64 * 1024);
    const { app, method, params } = (body ?? {}) as { app?: unknown; method?: unknown; params?: unknown };
    if (typeof app !== "string" || typeof method !== "string") throw new BahadError("invalid", "app and method are required");
    const user = await getAuthUser();
    const result = await executeCall(await engineDeps(), { userId: user?.id ?? null, slug: app }, method, params);
    return Response.json({ result: result ?? null }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}
