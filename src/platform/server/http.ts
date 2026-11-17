import "server-only";
import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { HTTP_STATUS, toErrorShape, BahadError } from "../errors";
import { cronSecret, vapidConfig } from "./config";
import { getDb } from "./db";
import type { EngineDeps } from "./engine";
import { publishChange } from "./realtime";
import { sendDuePush, webPushSender } from "./push";

/**
 * CSRF guard for state-changing API calls: the request must come from a page of
 * this site. Sandboxed simple apps send "Origin: null" and are rejected here —
 * they can only reach the API through the host page's postMessage bridge.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return false;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const candidates = [req.headers.get("x-forwarded-host"), req.headers.get("host")].filter(Boolean) as string[];
  return candidates.some((h) => h.split(",")[0].trim() === host);
}

export function jsonError(e: unknown): Response {
  const shape = toErrorShape(e);
  const internal = !(e instanceof BahadError);
  if (internal) console.error("[api] internal error", e);
  return Response.json({ error: shape }, { status: internal ? 500 : HTTP_STATUS[shape.code], headers: { "cache-control": "no-store" } });
}

export async function sendPushNow() {
  const vapid = vapidConfig();
  if (!vapid) return null;
  const db = await getDb();
  return sendDuePush(db, await webPushSender(vapid));
}

export async function engineDeps(): Promise<EngineDeps> {
  return {
    db: await getDb(),
    publish: publishChange,
    onPushDue: () =>
      after(async () => {
        try {
          await sendPushNow();
        } catch (e) {
          console.error("[push] immediate send failed", e);
        }
      }),
  };
}

/** Cron endpoints: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron style) or `x-cron-secret`. */
export function cronAuthorized(req: Request): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  const given = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) throw new BahadError("invalid", "content-type must be application/json");
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new BahadError("invalid", "request too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new BahadError("invalid", "invalid JSON");
  }
}
