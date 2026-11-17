// Runs once when the Node server starts. With BAHAD_INTERNAL_CRON=1 (local dev,
// or a single Linux box without a systemd timer) it sends due push notifications
// every minute and runs the daily cleanup — instead of pg_cron / an external timer.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.BAHAD_INTERNAL_CRON !== "1") return;
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
