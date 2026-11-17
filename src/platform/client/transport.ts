// Browser → /api/platform/call. Used by full apps directly and by the simple-app host page.
import { BahadError, isErrorShape } from "../errors";

export async function callApi<T = unknown>(app: string, method: string, params?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/platform/call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app, method, params: params ?? {} }),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new BahadError("invalid", "network error — check your connection");
  }
  let body: { result?: T; error?: unknown } = {};
  try {
    body = await res.json();
  } catch {
    throw new BahadError("invalid", `unexpected response (HTTP ${res.status})`);
  }
  if (body.error) {
    if (isErrorShape(body.error)) throw new BahadError(body.error.code, body.error.message);
    throw new BahadError("invalid", "unknown error");
  }
  return body.result as T;
}
