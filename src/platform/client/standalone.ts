// Source of /bahad.js — the helper SIMPLE apps load with <script src="/bahad.js">.
// Built by scripts/build-bahad-js.ts (esbuild → IIFE). Two modes:
//   * inside the portal (window.parent !== window): talks to the host page via postMessage
//   * standalone (opened as a local file, or outside the portal): MOCK mode — fake user,
//     data kept in localStorage (or memory), and a small "מצב פיתוח" badge.
import { BRIDGE_VERSION } from "../bridge";
import type {
  Bahad,
  BahadErrorCode,
  BahadRecord,
  Collection,
  JsonObject,
  ListOptions,
  Me,
  NotifyOptions,
  NotifyResult,
  Person,
  PushMessage,
} from "../types";

class BahadError extends Error {
  code: BahadErrorCode;
  constructor(code: BahadErrorCode, message: string) {
    super(message);
    this.name = "BahadError";
    this.code = code;
  }
}

type Listener = () => void;

interface Transport {
  isMock: boolean;
  ready(): Promise<void>;
  call(method: string, params?: unknown): Promise<unknown>;
  onEvent(handler: (e: { event: string; collection?: string; message?: PushMessage }) => void): void;
}

// ── portal transport ─────────────────────────────────────────────────────────

function portalTransport(): Transport {
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  const handlers: ((e: { event: string; collection?: string; message?: PushMessage }) => void)[] = [];
  let seq = 0;
  window.addEventListener("message", (ev) => {
    if (ev.source !== window.parent) return;
    const d = ev.data;
    if (!d || d.__bahad !== 1 || d.v !== BRIDGE_VERSION) return;
    if (typeof d.event === "string") {
      for (const h of handlers) h(d);
      return;
    }
    const p = pending.get(d.id);
    if (!p) return;
    pending.delete(d.id);
    if (d.error) p.reject(new BahadError(d.error.code, d.error.message));
    else p.resolve(d.result);
  });
  const call = (method: string, params?: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      const id = `${Date.now().toString(36)}-${++seq}`;
      pending.set(id, { resolve, reject });
      // The portal is our parent and same-origin with us, but our sandboxed origin is opaque,
      // so the parent's origin cannot be named here. Messages carry no secrets.
      window.parent.postMessage({ __bahad: 1, v: BRIDGE_VERSION, id, method, params: params ?? {} }, "*");
      setTimeout(() => {
        if (pending.delete(id)) reject(new BahadError("invalid", "the portal did not answer (timeout)"));
      }, 30_000);
    });
  // Handshake: the host page may still be hydrating when this script runs, so keep
  // saying hello until it answers (messages sent before its listener exists are lost).
  let readyP: Promise<void> | null = null;
  const handshake = () =>
    new Promise<void>((resolve, reject) => {
      let done = false;
      const ids: string[] = [];
      const send = () => {
        const id = `hello-${++seq}`;
        ids.push(id);
        pending.set(id, {
          resolve: () => {
            if (done) return;
            done = true;
            clearInterval(timer);
            ids.forEach((x) => pending.delete(x));
            resolve();
          },
          reject: () => {},
        });
        window.parent.postMessage({ __bahad: 1, v: BRIDGE_VERSION, id, method: "bridge.hello", params: {} }, "*");
      };
      const timer = setInterval(send, 250);
      send();
      setTimeout(() => {
        if (done) return;
        clearInterval(timer);
        ids.forEach((x) => pending.delete(x));
        reject(new BahadError("invalid", "could not connect to the portal"));
      }, 20_000);
    });
  return {
    isMock: false,
    ready: () => (readyP ??= handshake()),
    call,
    onEvent: (h) => void handlers.push(h),
  };
}

// ── mock transport ───────────────────────────────────────────────────────────

function mockTransport(): Transport {
  const params = new URLSearchParams(location.search);
  const role = (["cadet", "commander", "admin"] as const).find((r) => r === params.get("mockRole")) ?? "cadet";
  const user: Me = {
    id: `mock-${role}`,
    name: role === "cadet" ? "חניך לדוגמה" : role === "commander" ? "מפקד לדוגמה" : "מנהל לדוגמה",
    avatarUrl: null,
    role,
    company: { id: "mock-company", name: "פלוגה א'" },
    platoon: role === "commander" ? null : { id: "mock-platoon", name: "מחלקה 1" },
    email: "cadet@example.com",
    phone: "050-0000000",
  };
  const storeKey = `bahad-mock:${location.pathname}`;
  let memory: Record<string, BahadRecord[]> = {};
  const load = (): Record<string, BahadRecord[]> => {
    try {
      const raw = window.localStorage.getItem(storeKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return memory; // sandboxed / private mode: no localStorage
    }
  };
  const save = (all: Record<string, BahadRecord[]>) => {
    memory = all;
    try {
      window.localStorage.setItem(storeKey, JSON.stringify(all));
    } catch {
      /* memory only */
    }
  };
  const handlers: ((e: { event: string; collection?: string }) => void)[] = [];
  const changed = (collection: string) => setTimeout(() => handlers.forEach((h) => h({ event: "changed", collection })), 0);
  try {
    window.addEventListener("storage", (e) => {
      if (e.key === storeKey) Object.keys(load()).forEach(changed);
    });
  } catch {
    /* ignore */
  }

  const uuid = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));

  const plain = (v: unknown, what: string): JsonObject => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new BahadError("invalid", `${what} must be a plain object`);
    const text = JSON.stringify(v);
    if (new Blob([text]).size > 16 * 1024) throw new BahadError("invalid", "record is larger than 16 KB");
    return JSON.parse(text);
  };

  const call = async (method: string, p: Record<string, unknown> = {}): Promise<unknown> => {
    const all = load();
    const name = String(p.collection ?? "");
    const list = (all[name] ??= []);
    const now = new Date().toISOString();
    switch (method) {
      case "user.me":
        return { ...user };
      case "data.add": {
        const rec: BahadRecord = { id: uuid(), data: plain(p.data, "data"), owner: { id: user.id, name: user.name }, mine: true, createdAt: now, updatedAt: now };
        list.push(rec);
        save(all);
        changed(name);
        return rec;
      }
      case "data.list": {
        const o = (p.options ?? {}) as ListOptions;
        const limit = o.limit ?? 50;
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new BahadError("invalid", "limit must be 1–200");
        const [field, dir] = (o.order ?? "createdAt:desc").split(":") as ["createdAt" | "updatedAt", string];
        return list
          .filter((r) => Object.entries(o.where ?? {}).every(([k, v]) => (r.data as Record<string, unknown>)[k] === v))
          .sort((a, b) => (dir === "asc" ? 1 : -1) * a[field].localeCompare(b[field]))
          .slice(0, limit);
      }
      case "data.get": {
        const r = list.find((x) => x.id === p.id);
        if (!r) throw new BahadError("not_found", "record not found");
        return r;
      }
      case "data.update": {
        const r = list.find((x) => x.id === p.id);
        if (!r) throw new BahadError("not_found", "record not found");
        r.data = plain({ ...r.data, ...plain(p.patch, "patch") }, "data");
        r.updatedAt = now;
        save(all);
        changed(name);
        return r;
      }
      case "data.remove": {
        const i = list.findIndex((x) => x.id === p.id);
        if (i < 0) throw new BahadError("not_found", "record not found");
        list.splice(i, 1);
        save(all);
        changed(name);
        return null;
      }
      case "push.notify": {
        const o = p.options as NotifyOptions;
        console.info("[bahad mock] push.notify", o);
        showToast(`🔔 ${o?.title ?? ""}`);
        return { id: uuid(), recipients: 1 } satisfies NotifyResult;
      }
      case "push.cancel":
        return null;
      case "people.get": {
        if (p.id !== user.id) throw new BahadError("not_found", "user not found (mock mode knows only the fake user)");
        const person: Person = { id: user.id, name: user.name, avatarUrl: null, role, company: "פלוגה א'", platoon: role === "commander" ? null : "מחלקה 1", phone: "050-0000000", email: "cadet@example.com" };
        return person;
      }
      default:
        throw new BahadError("invalid", `unknown method "${method}"`);
    }
  };

  const badge = () => {
    const b = document.createElement("div");
    b.textContent = "מצב פיתוח";
    b.setAttribute("role", "status");
    b.title = "bahad.js רץ מחוץ לפורטל: משתמש מדומה ונתונים מקומיים";
    b.style.cssText =
      "position:fixed;inset-block-end:8px;inset-inline-start:8px;z-index:2147483647;background:#b45309;color:#fff;" +
      "font:600 12px/1.6 system-ui,sans-serif;padding:2px 10px;border-radius:999px;pointer-events:none;opacity:.9";
    document.body.appendChild(b);
  };
  if (document.body) badge();
  else document.addEventListener("DOMContentLoaded", badge);

  return {
    isMock: true,
    ready: async () => {},
    // Return copies, so app code can never mutate the stored records by accident.
    call: async (m, params) => {
      const r = await call(m, (params ?? {}) as Record<string, unknown>);
      return r === null || r === undefined ? null : JSON.parse(JSON.stringify(r));
    },
    onEvent: (h) => void handlers.push(h),
  };
}

function showToast(message: string) {
  const t = document.createElement("div");
  t.textContent = message;
  t.setAttribute("role", "status");
  t.style.cssText =
    "position:fixed;inset-inline:16px;inset-block-end:48px;margin-inline:auto;max-width:420px;z-index:2147483647;" +
    "background:#111827;color:#fff;font:500 14px/1.5 system-ui,sans-serif;padding:10px 14px;border-radius:12px;text-align:center";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ── public object ────────────────────────────────────────────────────────────

function create(): Bahad {
  const inPortal = window.parent !== window;
  const t = inPortal ? portalTransport() : mockTransport();
  const listeners = new Map<string, Set<Listener>>();
  const pushHandlers = new Set<(m: PushMessage) => void>();
  t.onEvent((e) => {
    if (e.event === "changed" && e.collection) listeners.get(e.collection)?.forEach((l) => l());
    if (e.event === "push" && e.message) pushHandlers.forEach((h) => h(e.message!));
  });
  const api = async (method: string, params?: unknown) => {
    await t.ready();
    return t.call(method, params);
  };
  const collection = <T extends JsonObject = JsonObject>(name: string): Collection<T> => ({
    add: (data) => api("data.add", { collection: name, data }) as Promise<BahadRecord<T>>,
    list: (options) => api("data.list", { collection: name, options }) as Promise<BahadRecord<T>[]>,
    get: (id) => api("data.get", { collection: name, id }) as Promise<BahadRecord<T>>,
    update: (id, patch) => api("data.update", { collection: name, id, patch }) as Promise<BahadRecord<T>>,
    remove: async (id) => {
      await api("data.remove", { collection: name, id });
    },
    subscribe(onChange) {
      let set = listeners.get(name);
      if (!set) {
        set = new Set();
        listeners.set(name, set);
        if (inPortal) api("data.subscribe", { collection: name }).catch((e) => console.error("[bahad] subscribe failed", e));
      }
      set.add(onChange);
      return () => {
        const s = listeners.get(name);
        if (!s) return;
        s.delete(onChange);
        if (s.size === 0) {
          listeners.delete(name);
          if (inPortal) api("data.unsubscribe", { collection: name }).catch(() => {});
        }
      };
    },
  });
  return {
    isMock: t.isMock,
    ready: () => t.ready(),
    user: { me: () => api("user.me") as Promise<Me> },
    data: { collection },
    people: { get: (id) => api("people.get", { id }) as Promise<Person> },
    push: {
      notify: (options) => api("push.notify", { options }) as Promise<NotifyResult>,
      cancel: async (id) => {
        await api("push.cancel", { id });
      },
      onReceive(handler) {
        pushHandlers.add(handler);
        return () => void pushHandlers.delete(handler);
      },
    },
    ui: {
      setTitle(title) {
        if (inPortal) void api("ui.setTitle", { title: String(title) });
        else document.title = String(title);
      },
      toast(message) {
        if (inPortal) void api("ui.toast", { message: String(message) });
        else showToast(String(message));
      },
      home() {
        if (inPortal) void api("ui.home");
        else console.info("[bahad mock] ui.home()");
      },
    },
  };
}

declare global {
  interface Window {
    bahad: Bahad;
    BahadError: typeof BahadError;
  }
}

if (!window.bahad) {
  Object.defineProperty(window, "bahad", { value: create(), writable: false, configurable: false });
  window.BahadError = BahadError;
}
