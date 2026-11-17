// Server-Sent Events stream of "collection changed" signals (realtime mode "sse":
// local development and single-process Linux hosting). No data is ever sent —
// only the signal; clients re-fetch through the API.
import { BahadError } from "@/platform/errors";
import { getAuthUser } from "@/platform/auth";
import { executeCall } from "@/platform/server/engine";
import { getDb } from "@/platform/server/db";
import { realtimeMode } from "@/platform/server/config";
import { bus, topicFor } from "@/platform/server/realtime";
import { jsonError } from "@/platform/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (realtimeMode() !== "sse") throw new BahadError("not_found", "realtime runs on Supabase in this deployment");
    const url = new URL(req.url);
    const app = url.searchParams.get("app") ?? "";
    const collection = url.searchParams.get("collection") ?? "";
    const user = await getAuthUser();
    // Same checks as any API call (session, approval, app status, audience, scope, collection).
    await executeCall({ db: await getDb() }, { userId: user?.id ?? null, slug: app }, "data.access", { collection });

    const topic = topicFor(app, collection);
    const enc = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (s: string) => {
          try {
            controller.enqueue(enc.encode(s));
          } catch {
            cleanup();
          }
        };
        const onChange = () => send("event: changed\ndata: {}\n\n");
        const ping = setInterval(() => send(": ping\n\n"), 25_000);
        bus().on(topic, onChange);
        cleanup = () => {
          clearInterval(ping);
          bus().off(topic, onChange);
        };
        req.signal.addEventListener("abort", () => {
          cleanup();
          try {
            controller.close();
          } catch {}
        });
        send("retry: 3000\n: connected\n\n");
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no", // nginx: do not buffer (see LINUX.md)
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
