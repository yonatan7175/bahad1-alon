"use client";
// "Collection changed" subscriptions in the browser. Mode comes from the server
// (passed down by the host page) so client and server always agree.
import type { SupabaseClient } from "@supabase/supabase-js";

export type RealtimeMode = "supabase" | "sse";
type Listener = () => void;

interface Channel {
  listeners: Set<Listener>;
  close: () => void;
}
const channels = new Map<string, Channel>();
let supabase: SupabaseClient | null = null;

async function getSupabase(): Promise<SupabaseClient> {
  if (!supabase) {
    const { createBrowserClient } = await import("@supabase/ssr");
    supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }
  return supabase;
}

function fire(key: string) {
  for (const l of channels.get(key)?.listeners ?? []) {
    try {
      l();
    } catch (e) {
      console.error(e);
    }
  }
}

function openSse(key: string, app: string, collection: string): () => void {
  let es: EventSource | null = null;
  let closed = false;
  let hadError = false;
  const connect = () => {
    if (closed) return;
    es = new EventSource(`/api/platform/events?app=${encodeURIComponent(app)}&collection=${encodeURIComponent(collection)}`);
    es.addEventListener("changed", () => fire(key));
    es.onopen = () => {
      // Missed signals while disconnected → let the app re-fetch once.
      if (hadError) fire(key);
      hadError = false;
    };
    es.onerror = () => {
      hadError = true;
      // 4xx answers close the stream; EventSource retries 5xx/network on its own.
      if (es?.readyState === EventSource.CLOSED) setTimeout(connect, 10_000);
    };
  };
  connect();
  return () => {
    closed = true;
    es?.close();
  };
}

function openSupabase(key: string, app: string, collection: string): () => void {
  let stop: (() => void) | null = null;
  let closed = false;
  void (async () => {
    const sb = await getSupabase();
    await sb.realtime.setAuth();
    if (closed) return;
    let subscribedOnce = false;
    const ch = sb
      .channel(`bahad:${app}:${collection}`, { config: { private: true } })
      .on("broadcast", { event: "changed" }, () => fire(key))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (subscribedOnce) fire(key); // re-subscribed after a drop
          subscribedOnce = true;
        }
      });
    stop = () => void sb.removeChannel(ch);
  })().catch((e) => console.error("[realtime]", e));
  return () => {
    closed = true;
    stop?.();
  };
}

/** Subscribe to change signals for one app collection. Returns an unsubscribe function. */
export function subscribeSignal(mode: RealtimeMode, app: string, collection: string, listener: Listener): () => void {
  const key = `${app}:${collection}`;
  let ch = channels.get(key);
  if (!ch) {
    const c: Channel = { listeners: new Set(), close: () => {} };
    channels.set(key, c);
    c.close = mode === "sse" ? openSse(key, app, collection) : openSupabase(key, app, collection);
    ch = c;
  }
  ch.listeners.add(listener);
  // Coming back to the tab/app: re-fetch in case signals were missed while asleep.
  const onVisible = () => {
    if (document.visibilityState === "visible") listener();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    const c = channels.get(key);
    if (!c) return;
    c.listeners.delete(listener);
    if (c.listeners.size === 0) {
      c.close();
      channels.delete(key);
    }
  };
}
