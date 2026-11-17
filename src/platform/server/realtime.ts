import "server-only";
import { EventEmitter } from "node:events";
import { realtimeMode, supabaseConfig } from "./config";

// "Collection changed" signals — never carry data (plan 05, rule 5).
//   supabase: broadcast on private channel  bahad:<slug>:<collection>  (Vercel / serverless)
//   sse:      in-process event bus, streamed by /api/platform/events     (single Node process: local, Linux box)

export function topicFor(slug: string, collection: string) {
  return `bahad:${slug}:${collection}`;
}

const g = globalThis as unknown as { __bahadBus?: EventEmitter };
export function bus(): EventEmitter {
  if (!g.__bahadBus) {
    g.__bahadBus = new EventEmitter();
    g.__bahadBus.setMaxListeners(0);
  }
  return g.__bahadBus;
}

export async function publishChange(slug: string, collection: string): Promise<void> {
  const topic = topicFor(slug, collection);
  if (realtimeMode() === "sse") {
    bus().emit(topic);
    return;
  }
  const { url, serviceKey } = supabaseConfig();
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for realtime broadcast");
  const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ messages: [{ topic, event: "changed", payload: {}, private: true }] }),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`realtime broadcast failed: HTTP ${res.status}`);
}
