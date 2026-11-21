// "Add to my calendar" for one booking: a Google Calendar link (opens in the Google account the
// browser is signed in to) and a .ics file (iPhone / Outlook / any calendar app).
// Pure functions — no network: the Google link is a plain navigation the user taps.
import { SLOT_MINUTES, REMINDER_MINUTES, machineById } from "./machines";
import { slotStart } from "./time";

export interface CalendarEvent {
  uid: string;
  title: string;
  details: string;
  start: Date;
  end: Date;
}

/** The calendar event for a booking. `note` = e.g. "בחלוקה עם דנה". */
export function bookingEvent(b: { machine: string; day: string; time: string }, id: string, note: string, appUrl: string): CalendarEvent {
  const start = slotStart(b.day, b.time);
  return {
    uid: `laundry-${id}@bahad`,
    title: `${machineById(b.machine)?.label ?? "כביסה"} — שריון`,
    details: `${note}\nלו"ז מכונות כביסה: ${appUrl}`,
    start,
    end: new Date(start.getTime() + SLOT_MINUTES * 60_000),
  };
}

/** 2026-11-20T16:00:00.000Z → 20261120T160000Z */
const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarUrl(ev: CalendarEvent): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${utcStamp(ev.start)}/${utcStamp(ev.end)}`,
    details: ev.details,
    ctz: "Asia/Jerusalem",
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** RFC 5545 text escaping. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** RFC 5545 line folding: at most 75 octets per line (Hebrew is 2 bytes a letter), never splitting a character. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** A one-event .ics file with a reminder REMINDER_MINUTES before. */
export function icsFile(ev: CalendarEvent, now = new Date()): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//bahad//laundry//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(ev.start)}`,
    `DTEND:${utcStamp(ev.end)}`,
    `SUMMARY:${esc(ev.title)}`,
    `DESCRIPTION:${esc(ev.details)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(ev.title)}`,
    `TRIGGER:-PT${REMINDER_MINUTES}M`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n")
    .concat("\r\n");
}
