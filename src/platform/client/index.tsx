"use client";
// Platform API for FULL apps (client components):
//   import { bahad } from "@/platform/client"      — same methods as bahad.js
//   const bahad = useBahad()                        — same object, via React context
// The app identity is bound by <FullAppHost slug=…> in the app's route file
// (src/app/a/<slug>/page.tsx), never chosen by the app code itself.
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { BahadError } from "../errors";
import type { Bahad, BahadRecord, Collection, JsonObject, ListOptions, Me, NotifyOptions, NotifyResult, Person, PushMessage } from "../types";
import { callApi } from "./transport";
import { subscribeSignal, type RealtimeMode } from "./realtime";

export interface ShellApi {
  setTitle(title: string): void;
  toast(message: string): void;
  home(): void;
}

export function onPushMessage(app: string, handler: (m: PushMessage) => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => {};
  const fn = (e: MessageEvent) => {
    const d = e.data as { type?: string; app?: string; title?: string; body?: string | null; url?: string | null };
    if (d?.type === "bahad-push" && d.app === app && typeof d.title === "string") {
      handler({ title: d.title, body: d.body ?? null, url: d.url ?? null });
    }
  };
  navigator.serviceWorker.addEventListener("message", fn);
  return () => navigator.serviceWorker.removeEventListener("message", fn);
}

export function createBahad(slug: string, realtime: RealtimeMode, shell: ShellApi): Bahad {
  const collection = <T extends JsonObject = JsonObject>(name: string): Collection<T> => ({
    add: (data) => callApi<BahadRecord<T>>(slug, "data.add", { collection: name, data }),
    list: (options?: ListOptions) => callApi<BahadRecord<T>[]>(slug, "data.list", { collection: name, options }),
    get: (id) => callApi<BahadRecord<T>>(slug, "data.get", { collection: name, id }),
    update: (id, patch) => callApi<BahadRecord<T>>(slug, "data.update", { collection: name, id, patch }),
    remove: async (id) => {
      await callApi(slug, "data.remove", { collection: name, id });
    },
    subscribe: (onChange) => subscribeSignal(realtime, slug, name, onChange),
  });
  return {
    isMock: false,
    ready: async () => {},
    user: { me: () => callApi<Me>(slug, "user.me") },
    data: { collection },
    people: { get: (id: string) => callApi<Person>(slug, "people.get", { id }) },
    push: {
      notify: (options: NotifyOptions) => callApi<NotifyResult>(slug, "push.notify", { options }),
      cancel: async (id: string) => {
        await callApi(slug, "push.cancel", { id });
      },
      onReceive: (handler) => onPushMessage(slug, handler),
    },
    ui: {
      setTitle: (t) => shell.setTitle(String(t).slice(0, 40)),
      toast: (m) => shell.toast(String(m).slice(0, 200)),
      home: () => shell.home(),
    },
  };
}

// ── binding ──────────────────────────────────────────────────────────────────

let current: Bahad | null = null;
const BahadContext = createContext<Bahad | null>(null);

function unbound(): never {
  throw new BahadError("invalid", "bahad is used outside <FullAppHost> (only inside a full app's route)");
}

/** Module-level handle, bound to the full app currently on screen. */
export const bahad: Bahad = {
  get isMock() {
    return false;
  },
  ready: () => (current ?? unbound()).ready(),
  user: { me: () => (current ?? unbound()).user.me() },
  data: { collection: (name) => (current ?? unbound()).data.collection(name) },
  people: { get: (id) => (current ?? unbound()).people.get(id) },
  push: {
    notify: (o) => (current ?? unbound()).push.notify(o),
    cancel: (id) => (current ?? unbound()).push.cancel(id),
    onReceive: (h) => (current ?? unbound()).push.onReceive(h),
  },
  ui: {
    setTitle: (t) => (current ?? unbound()).ui.setTitle(t),
    toast: (m) => (current ?? unbound()).ui.toast(m),
    home: () => (current ?? unbound()).ui.home(),
  },
};

export function useBahad(): Bahad {
  const b = useContext(BahadContext);
  if (!b) unbound();
  return b;
}

export function BahadProvider({ value, children }: { value: Bahad; children: ReactNode }) {
  // Bound during render (not in an effect): children's effects run before their parents',
  // so an effect here would be too late for the app's first effects. Idempotent, and only one
  // full app is mounted at a time. useBahad() (context) is the side-effect-free alternative.
  // eslint-disable-next-line react-hooks/globals
  current = value;
  useEffect(() => {
    current = value;
    return () => {
      if (current === value) current = null;
    };
  }, [value]);
  return <BahadContext.Provider value={value}>{children}</BahadContext.Provider>;
}

export type { Bahad, BahadRecord, Collection, JsonObject, Me, Person } from "../types";
export { BahadError } from "../errors";
