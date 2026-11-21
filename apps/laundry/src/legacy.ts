// Bookings carried over from the old shared calendar (before this app), at their REAL times — which are
// not on the 40-minute grid (e.g. 11:35–12:10).
//
// How they live in the app (see app.json):
//  • "legacy" collection — one record per old booking: machine, day, from, to, name, phones. Only admins
//    write it, so the names can't be faked.
//  • "bookings" collection — for every 40-minute slot an old booking overlaps (even by a minute), one
//    whole-machine booking (seats 2) owned by the system profile "היומן הקודם". So the server's capacity rule
//    blocks new bookings there exactly like any taken slot, and every NEW booking stays on the grid.
// The calendar shows such a slot with the names and real times of the old bookings inside it.
import { SLOTS, SLOT_MINUTES } from "./machines";

export type Legacy = { machine: string; day: string; from: string; to: string; name: string; phones?: string[] };

/** "HH:MM" (or "24:00") → minutes after midnight. */
export const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Does the old booking overlap the 40-minute slot that starts at `time`? (Touching ends don't count.) */
export function overlapsSlot(l: Pick<Legacy, "from" | "to">, time: string): boolean {
  const s = toMin(time);
  return toMin(l.from) < s + SLOT_MINUTES && toMin(l.to) > s;
}

/** The grid slots an old booking blocks. */
export const slotsFor = (l: Pick<Legacy, "from" | "to">) => SLOTS.filter((t) => overlapsSlot(l, t));

/** The old bookings inside one slot of one machine, by start time. */
export function legacyInSlot<T extends { data: Legacy }>(list: readonly T[], machine: string, day: string, time: string): T[] {
  return list
    .filter((r) => r.data.machine === machine && r.data.day === day && overlapsSlot(r.data, time))
    .sort((a, b) => toMin(a.data.from) - toMin(b.data.from));
}

/** "23:00–00:00" — midnight shown as 00:00. */
export const legacyRange = (l: Pick<Legacy, "from" | "to">) => `${l.from}–${l.to === "24:00" ? "00:00" : l.to}`;
