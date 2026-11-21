// Runs once when the Node server starts. With BAHAD_INTERNAL_CRON=1 (local dev,
// or a single Linux box without a systemd timer) it sends due push notifications
// every minute and runs the daily cleanup — instead of pg_cron / an external timer.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  registerShutdown();
  if (process.env.BAHAD_INTERNAL_CRON !== "1") return;
  const g = globalThis as unknown as { __bahadCron?: boolean };
  if (g.__bahadCron) return;
  g.__bahadCron = true;
  const { getDb } = await import("./platform/server/db");
  const { sendPushNow } = await import("./platform/server/http");
  const { dailyCleanup } = await import("./platform/server/push");
  let lastDaily = 0;
  const tick = async () => {
    try {
      const r = await sendPushNow();
      if (r && r.claimed) console.log("[cron] push", r);
      if (Date.now() - lastDaily > 24 * 3600_000) {
        lastDaily = Date.now();
        console.log("[cron] daily cleanup", await dailyCleanup(await getDb()));
      }
    } catch (e) {
      console.error("[cron] failed", e);
    }
  };
  setInterval(tick, 60_000).unref();
  console.log("[cron] internal push sender every 60s");
}

/**
 * On SIGTERM/SIGINT (systemctl stop, Ctrl+C): close the database cleanly and exit within a few seconds.
 * Without this the server waits forever for open realtime (SSE) connections and systemd SIGKILLs it after
 * 90 s — killing an embedded PGlite mid-write risks the data.
 */
function registerShutdown() {
  const g = globalThis as unknown as { __bahadShutdown?: boolean; __bahadDb?: Promise<{ close(): Promise<void> }> };
  if (g.__bahadShutdown) return;
  g.__bahadShutdown = true;
  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[shutdown] ${signal} — closing the database`);
    const force = setTimeout(() => process.exit(0), 5_000);
    force.unref();
    void (async () => {
      try {
        const db = await g.__bahadDb?.catch(() => undefined);
        await db?.close();
        console.log("[shutdown] database closed");
      } catch (e) {
        console.error("[shutdown] close failed", e);
      }
      process.exit(0);
    })();
  };
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));
}
