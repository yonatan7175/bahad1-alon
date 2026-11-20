// Israel-time helpers (Asia/Jerusalem, with daylight saving), independent of the phone's timezone.
import { SLOT_MINUTES } from "./machines";

const TZ = "Asia/Jerusalem";

/** Offset of Israel from UTC at `date`, in minutes (120 in winter, 180 in summer). */
export function israelOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(date);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+02:00";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 120;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** "YYYY-MM-DD" of `date` in Israel. */
export function israelDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Hour (0–23) of `date` in Israel. */
export function israelHour(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(date));
}

/** The instant when it is `hour`:00 on `day` in Israel. */
export function israelTime(day: string, hour: number): Date {
  const [y, mo, d] = day.split("-").map(Number);
  const naiveUtc = Date.UTC(y, mo - 1, d, hour, 0, 0);
  // Two passes handle the DST switch correctly.
  let t = naiveUtc - israelOffsetMinutes(new Date(naiveUtc)) * 60_000;
  t = naiveUtc - israelOffsetMinutes(new Date(t)) * 60_000;
  return new Date(t);
}

/** ISO string with the Israeli offset, e.g. 2026-11-20T18:00:00+02:00 */
export function israelIso(day: string, hour: number): string {
  const off = israelOffsetMinutes(israelTime(day, hour));
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `${day}T${String(hour).padStart(2, "0")}:00:00${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/** The next `n` Israeli days starting today. */
export function nextDays(n: number, now = new Date()): string[] {
  const out: string[] = [];
  let t = israelTime(israelDay(now), 12).getTime(); // noon avoids DST edges
  for (let i = 0; i < n; i++) {
    out.push(israelDay(new Date(t)));
    t += 24 * 3600_000;
  }
  return out;
}

const WEEKDAYS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
export function dayLabel(day: string, today: string): string {
  if (day === today) return "היום";
  const t = israelTime(day, 12);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(t);
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  const [, m, d] = day.split("-");
  return `${WEEKDAYS[idx]} ${Number(d)}.${Number(m)}`;
}

/** The instant of "HH:MM" on `day`, Israel time. */
export function slotStart(day: string, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(israelTime(day, h).getTime() + m * 60_000);
}

/** ISO string with Israeli offset for "HH:MM" on `day`. */
export function slotIso(day: string, time: string): string {
  const [h, m] = time.split(":").map(Number);
  return israelIso(day, h).replace(/T(\d{2}):00:00/, `T$1:${String(m).padStart(2, "0")}:00`);
}

/** "HH:MM" + one slot (40 minutes). */
export function slotEnd(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const t = h * 60 + m + SLOT_MINUTES;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Sunday..Saturday range ("YYYY-MM-DD") of the week containing `day`. */
export function weekRange(day: string): [string, string] {
  const [y, m, d] = day.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const start = t - new Date(t).getUTCDay() * 86400_000;
  const iso = (x: number) => new Date(x).toISOString().slice(0, 10);
  return [iso(start), iso(start + 6 * 86400_000)];
}

/** "בעוד 2 שעות" style, from now until `t`. */
export function relativeFromNow(t: Date, now = new Date()): string {
  const min = Math.round((t.getTime() - now.getTime()) / 60_000);
  if (min < -30) return "עבר";
  if (min <= 0) return "עכשיו";
  if (min < 60) return `בעוד ${min} דק'`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? "בעוד שעה" : h === 2 ? "בעוד שעתיים" : `בעוד ${h} שעות`;
  const d = Math.round(h / 24);
  return d === 1 ? "מחר" : `בעוד ${d} ימים`;
}

/** day ± n days ("YYYY-MM-DD"). */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(day + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);
}

/** "נובמבר 2026" for the month containing `day`. */
export function monthLabel(day: string): string {
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"));
}

/** The 7 days (Sunday–Saturday) of the week containing `day`. */
export function weekDays(day: string): string[] {
  const [start] = weekRange(day);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Weeks (Sunday-first rows) covering the month containing `day`; days outside the month are null. */
export function monthGrid(day: string): (string | null)[][] {
  const first = day.slice(0, 8) + "01";
  const [y, m] = first.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = new Date(first + "T00:00:00Z").getUTCDay();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}
