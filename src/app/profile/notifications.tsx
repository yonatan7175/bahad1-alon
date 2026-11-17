"use client";
// Per-device notifications. The service worker (/sw.js — push only, no caching) is registered
// only when the user turns notifications on; permission is requested only on that tap.
import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { useToast } from "@/components/toast";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "insecure" | "denied" | "off" | "on";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json;
}

export function NotificationsToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const toast = useToast();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!window.isSecureContext) return setState("insecure");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  if (!vapidPublicKey) return <p className="text-sm text-muted">התראות עדיין לא הוגדרו באתר (חסרים מפתחות VAPID).</p>;

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
      await post("/api/push/subscribe", sub.toJSON());
      setState("on");
      toast("ההתראות הופעלו במכשיר הזה");
    } catch (e) {
      toast(`לא הצלחנו להפעיל התראות: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await post("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      await reg?.unregister();
      setState("off");
      toast("ההתראות כובו במכשיר הזה");
    } finally {
      setBusy(false);
    }
  };

  const test = async (delaySeconds: 0 | 60) => {
    try {
      await post("/api/push/test", { delaySeconds });
      toast(delaySeconds ? "התראת בדיקה תישלח בעוד דקה" : "התראת בדיקה נשלחה");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const note = (text: string) => (
    <p className="flex items-start gap-2 text-sm text-muted">
      <BellOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {text}
    </p>
  );

  switch (state) {
    case "loading":
      return <div className="skeleton h-11 w-40" />;
    case "insecure":
      return note("התראות פועלות רק כשהאתר נפתח בכתובת מאובטחת (https).");
    case "unsupported":
      return note("הדפדפן הזה לא תומך בהתראות מאתרים (למשל באייפון).");
    case "denied":
      return note("ההתראות חסומות בהגדרות הדפדפן לאתר הזה. אפשר לאפשר אותן שם ולחזור לכאן.");
    case "off":
      return (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">כבויות. תזכורות מאפליקציות (למשל כביסה) יגיעו רק אם יופעלו.</p>
          <button type="button" className="btn" onClick={enable} disabled={busy}>
            <BellRing className="size-4" aria-hidden="true" /> הפעלת התראות
          </button>
        </div>
      );
    case "on":
      return (
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-success">
            <BellRing className="size-4" aria-hidden="true" /> פעילות במכשיר הזה
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => test(0)}>
              שליחת בדיקה
            </button>
            <button type="button" className="btn-secondary" onClick={() => test(60)}>
              בדיקה בעוד דקה
            </button>
            <button type="button" className="btn-ghost text-danger" onClick={disable} disabled={busy}>
              כיבוי
            </button>
          </div>
        </div>
      );
  }
}
