// postMessage protocol between a simple app (bahad.js, inside the sandboxed
// iframe) and the portal host page (plan 05 — Transport).
//
//   app → host   { __bahad: 1, v: 1, id, method, params }
//   host → app   { __bahad: 1, v: 1, id, result } | { __bahad: 1, v: 1, id, error }
//   host → app   { __bahad: 1, v: 1, event: "changed", collection }
//                { __bahad: 1, v: 1, event: "push", message }

export const BRIDGE_VERSION = 1;

/** Forwarded to /api/platform/call (identity added by the host). */
export const API_METHODS = [
  "user.me",
  "data.add",
  "data.list",
  "data.get",
  "data.update",
  "data.remove",
  "push.notify",
  "push.cancel",
  "people.get",
] as const;

/** Handled by the host page itself. */
export const HOST_METHODS = ["bridge.hello", "ui.setTitle", "ui.toast", "ui.home", "data.subscribe", "data.unsubscribe"] as const;

export type BridgeMethod = (typeof API_METHODS)[number] | (typeof HOST_METHODS)[number];

export interface BridgeRequest {
  __bahad: 1;
  v: number;
  id: string;
  method: string;
  params?: unknown;
}

export function isBridgeRequest(d: unknown): d is BridgeRequest {
  const x = d as BridgeRequest;
  return (
    typeof x === "object" &&
    x !== null &&
    x.__bahad === 1 &&
    x.v === BRIDGE_VERSION &&
    typeof x.id === "string" &&
    x.id.length > 0 &&
    x.id.length <= 64 &&
    typeof x.method === "string" &&
    x.method.length <= 40
  );
}
