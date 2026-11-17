"use client";
// Hosts a SIMPLE app in a sandboxed iframe and bridges bahad.js calls to the API
// (plan 05 — Transport, plan 10 — Threats):
//   * sandbox WITHOUT allow-same-origin → the app cannot read portal cookies/storage
//   * only messages whose event.source is OUR iframe are accepted
//   * the app identity (slug) comes from this page's URL, never from the message
import { useEffect, useRef } from "react";
import { API_METHODS, BRIDGE_VERSION, isBridgeRequest } from "@/platform/bridge";
import { BahadError, toErrorShape } from "@/platform/errors";
import { callApi } from "@/platform/client/transport";
import { subscribeSignal, type RealtimeMode } from "@/platform/client/realtime";
import { onPushMessage } from "@/platform/client";
import { useShell } from "./app-frame";

export const SIMPLE_APP_SANDBOX = "allow-scripts allow-forms allow-popups";
const MAX_CALLS_PER_SECOND = 40;

export function SimpleAppHost({ slug, name, realtime }: { slug: string; name: string; realtime: RealtimeMode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const shell = useShell();

  useEffect(() => {
    const subs = new Map<string, () => void>();
    let windowStart = Date.now();
    let calls = 0;
    const post = (msg: object) => frame.current?.contentWindow?.postMessage({ __bahad: 1, v: BRIDGE_VERSION, ...msg }, "*");

    const onMessage = async (e: MessageEvent) => {
      const win = frame.current?.contentWindow;
      if (!win || e.source !== win) return; // not from our app frame
      if (!isBridgeRequest(e.data)) return;
      const { id, method } = e.data;
      const params = (typeof e.data.params === "object" && e.data.params !== null ? e.data.params : {}) as Record<string, unknown>;
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        calls = 0;
      }
      if (++calls > MAX_CALLS_PER_SECOND) {
        post({ id, error: { code: "rate_limited", message: "too many calls" } });
        return;
      }
      try {
        let result: unknown = null;
        switch (method) {
          case "bridge.hello":
            result = { v: BRIDGE_VERSION };
            break;
          case "ui.setTitle":
            shell.setTitle(String(params.title ?? "").slice(0, 40));
            break;
          case "ui.toast":
            shell.toast(String(params.message ?? "").slice(0, 200));
            break;
          case "ui.home":
            shell.home();
            break;
          case "data.subscribe": {
            const c = String(params.collection ?? "");
            if (!subs.has(c)) {
              await callApi(slug, "data.access", { collection: c }); // same server checks as a read
              subs.set(c, subscribeSignal(realtime, slug, c, () => post({ event: "changed", collection: c })));
            }
            break;
          }
          case "data.unsubscribe": {
            const c = String(params.collection ?? "");
            subs.get(c)?.();
            subs.delete(c);
            break;
          }
          default:
            if (!(API_METHODS as readonly string[]).includes(method)) throw new BahadError("invalid", `unknown method "${method}"`);
            result = await callApi(slug, method, params);
        }
        post({ id, result });
      } catch (err) {
        post({ id, error: toErrorShape(err) });
      }
    };

    window.addEventListener("message", onMessage);
    const stopPush = onPushMessage(slug, (message) => post({ event: "push", message }));
    return () => {
      window.removeEventListener("message", onMessage);
      stopPush();
      subs.forEach((u) => u());
      subs.clear();
    };
  }, [slug, realtime, shell]);

  return (
    <iframe
      ref={frame}
      src={`/apps/${slug}/index.html`}
      title={name}
      sandbox={SIMPLE_APP_SANDBOX}
      referrerPolicy="same-origin"
      allow=""
      className="absolute inset-0 h-full w-full border-0 bg-bg"
      data-testid="simple-app-frame"
    />
  );
}
