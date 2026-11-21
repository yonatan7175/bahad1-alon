"use client";
// Data layer of the laundry app: bookings per day, my bookings, broken machines,
// and the actions (book / cancel / share / mark broken). All rules (a slot holds the whole machine for one
// person or is shared by two, 3 washes + 3 dries a week) are enforced by the server — see app.json "capacity" / "quota".
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BahadError, useBahad, type BahadRecord, type Me } from "@/platform/client";
import { KIND_LABEL, MACHINES, REMINDER_MINUTES, SLOTS, SLOT_SEATS, WEEKLY_LIMIT, machineById, type Kind, type Machine } from "./machines";
import { dayLabel, israelDay, slotEnd, slotIso, slotStart, weekRange } from "./time";
import { legacyInSlot, type Legacy } from "./legacy";

/** phone: the booker's, saved with the booking so everyone sees how to reach whoever holds the slot.
 *  (The name always comes from the server — rec.owner.name — so it can't be faked.) */
/** seats: 2 = the whole machine, 1 = shared with one more person. Bookings from before sharing have none = whole. */
export type Booking = { machine: string; kind: Kind; day: string; time: string; seats?: 1 | 2; start: string; phone?: string; reminderId?: string };
export type Rec = BahadRecord<Booking>;

export const seatsOf = (r: Rec): number => (r.data.seats === 1 ? 1 : SLOT_SEATS);
export const isShared = (r: Rec) => seatsOf(r) < SLOT_SEATS;

/** Who holds a (machine, time) slot and how many seats are left (0 = full, 1 = one person can join). */
export interface SlotState {
  recs: Rec[];
  left: number;
  mine?: Rec;
}
export function slotState(recs: Rec[] | undefined): SlotState {
  const list = [...(recs ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { recs: list, left: Math.max(0, SLOT_SEATS - list.reduce((n, r) => n + seatsOf(r), 0)), mine: list.find((r) => r.mine) };
}
/** Bookings of one day grouped by "machine|time". */
export function groupSlots(list: Rec[] | undefined): Map<string, Rec[]> {
  const map = new Map<string, Rec[]>();
  for (const r of list ?? []) {
    const k = `${r.data.machine}|${r.data.time}`;
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return map;
}
export type LegacyRec = BahadRecord<Legacy>;
type Status = { machine: string; broken: boolean; note?: string };
export type StatusRec = BahadRecord<Status>;

const valid = (r: Rec) => typeof r.data.time === "string" && SLOTS.includes(r.data.time) && !!machineById(r.data.machine);

export function useLaundry() {
  const bahad = useBahad();
  const bookings = useMemo(() => bahad.data.collection<Booking>("bookings"), [bahad]);
  const statuses = useMemo(() => bahad.data.collection<Status>("machine_status"), [bahad]);
  const legacy = useMemo(() => bahad.data.collection<Legacy>("legacy"), [bahad]);
  const [me, setMe] = useState<Me | null>(null);
  const [byDay, setByDay] = useState<Record<string, Rec[]>>({});
  /** Bookings from the old calendar, per day (see ./legacy.ts). */
  const [legacyByDay, setLegacyByDay] = useState<Record<string, LegacyRec[]>>({});
  const [mine, setMine] = useState<Rec[] | null>(null);
  const [broken, setBroken] = useState<Record<string, StatusRec>>({});
  const loaded = useRef(new Set<string>());

  const loadDay = useCallback(
    async (day: string) => {
      const [w, d, old] = await Promise.all([
        bookings.list({ where: { day, kind: "washer" }, limit: 200 }),
        bookings.list({ where: { day, kind: "dryer" }, limit: 200 }),
        legacy.list({ where: { day }, limit: 200 }).catch(() => [] as LegacyRec[]),
      ]);
      loaded.current.add(day);
      setLegacyByDay((prev) => ({ ...prev, [day]: old }));
      setByDay((prev) => ({ ...prev, [day]: [...w, ...d].filter(valid) }));
    },
    [bookings, legacy],
  );
  const loadMine = useCallback(async () => {
    setMine((await bookings.list({ mine: true, limit: 200 })).filter(valid));
  }, [bookings]);
  const loadStatus = useCallback(async () => {
    const list = await statuses.list({ limit: 50 });
    setBroken(Object.fromEntries(list.filter((s) => s.data.broken).map((s) => [s.data.machine, s])));
  }, [statuses]);

  const toast = useCallback((m: string) => bahad.ui.toast(m), [bahad]);

  useEffect(() => {
    bahad.user.me().then(setMe).catch(() => {});
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async: state is set after the fetch resolves
    loadMine().catch(() => toast("לא הצלחנו לטעון את השריונים שלך"));
    loadStatus().catch(() => {});
    const refresh = () => {
      void Promise.all([...loaded.current].map((d) => loadDay(d)))
        .then(() => loadMine())
        .catch(() => {});
    };
    const stop1 = bookings.subscribe(refresh);
    const stop2 = statuses.subscribe(() => void loadStatus().catch(() => {}));
    const stop3 = legacy.subscribe(refresh);
    return () => {
      stop1();
      stop2();
      stop3();
    };
  }, [bahad, bookings, statuses, legacy, loadDay, loadMine, loadStatus, toast]);

  /** The system profile that owns the carried-over bookings (= the owner of the "legacy" records). */
  const legacyOwners = useMemo(() => new Set(Object.values(legacyByDay).flatMap((l) => l.map((r) => r.owner.id))), [legacyByDay]);
  /** For a booking that holds a slot for the old calendar: the old bookings inside that slot. Otherwise null. */
  const legacyOf = useCallback(
    (rec: Rec): LegacyRec[] | null =>
      legacyOwners.has(rec.owner.id) ? legacyInSlot(legacyByDay[rec.data.day] ?? [], rec.data.machine, rec.data.day, rec.data.time) : null,
    [legacyOwners, legacyByDay],
  );
  /** Who holds a booking, for display: the old calendar's names for carried-over slots, else the account name. */
  const nameOf = useCallback(
    (rec: Rec): string => {
      const old = legacyOf(rec);
      return old && old.length ? old.map((l) => l.data.name).join(" · ") : rec.owner.name;
    },
    [legacyOf],
  );

  /** How many bookings of `kind` I have in the week containing `day`. */
  const usedInWeek = useCallback(
    (day: string, kind: Kind) => {
      const [from, to] = weekRange(day);
      return (mine ?? []).filter((r) => r.data.kind === kind && r.data.day >= from && r.data.day <= to).length;
    },
    [mine],
  );

  const book = useCallback(
    async (m: Machine, day: string, time: string, seats: 1 | 2): Promise<boolean> => {
      try {
        const who = me ?? (await bahad.user.me());
        const data: Booking = { machine: m.id, kind: m.kind, day, time, seats, start: slotIso(day, time) };
        if (who.phone) data.phone = who.phone;
        const rec = await bookings.add(data);
        // Reminder 10 minutes before (only arrives if notifications are on in the profile).
        const at = new Date(slotStart(day, time).getTime() - REMINDER_MINUTES * 60_000);
        if (at.getTime() - Date.now() > 60_000) {
          try {
            const n = await bahad.push.notify({
              to: "me",
              title: `${m.label} — בעוד ${REMINDER_MINUTES} דק'`,
              body: `השריון שלך ${time}–${slotEnd(time)}, ${dayLabel(day, israelDay(new Date()))}`,
              at: at.toISOString(),
              url: `/a/laundry?day=${day}&kind=${m.kind}`,
            });
            await bookings.update(rec.id, { reminderId: n.id });
          } catch {
            /* the reminder is a bonus */
          }
        }
        toast(`שוריין ✔ ${m.label}, ${time}${seats === 1 ? " · בחלוקה" : ""}`);
        await Promise.all([loadDay(day), loadMine()]);
        return true;
      } catch (e) {
        const code = e instanceof BahadError ? e.code : undefined;
        if (code === "conflict") toast(seats === 1 ? "המקום במשבצת נתפס רגע לפניך — בחרו אחרת" : "מישהו שריין את המשבצת רגע לפניך — אפשר אולי להתחלק, או לבחור אחרת");
        else if (code === "rate_limited") toast(`הגעת למכסה: ${WEEKLY_LIMIT} ${KIND_LABEL[m.kind].many} בשבוע (א'–ש')`);
        else toast(`שגיאה: ${(e as Error).message}`);
        await loadDay(day).catch(() => {});
        return false;
      }
    },
    [bahad, me, bookings, loadDay, loadMine, toast],
  );

  const cancel = useCallback(
    async (rec: Rec): Promise<boolean> => {
      try {
        if (rec.mine && rec.data.reminderId) await bahad.push.cancel(rec.data.reminderId).catch(() => {});
        await bookings.remove(rec.id);
        toast(rec.mine ? "השריון בוטל" : "המשבצת פונתה");
        await Promise.all([loadDay(rec.data.day), loadMine()]);
        return true;
      } catch (e) {
        toast(`שגיאה: ${(e as Error).message}`);
        return false;
      }
    },
    [bahad, bookings, loadDay, loadMine, toast],
  );

  /** Open my whole-machine booking for sharing (2 → 1 seat), or take the whole machine (1 → 2) when nobody shares it. */
  const setSeats = useCallback(
    async (rec: Rec, seats: 1 | 2): Promise<boolean> => {
      try {
        await bookings.update(rec.id, { seats });
        toast(seats === 1 ? "המשבצת פתוחה לחלוקה" : "כל המכונה שלך במשבצת הזו");
        await Promise.all([loadDay(rec.data.day), loadMine()]);
        return true;
      } catch (e) {
        const code = e instanceof BahadError ? e.code : undefined;
        toast(code === "conflict" ? "מישהו כבר מתחלק איתך במשבצת" : `שגיאה: ${(e as Error).message}`);
        await loadDay(rec.data.day).catch(() => {});
        return false;
      }
    },
    [bookings, loadDay, loadMine, toast],
  );

  const setMachineBroken = useCallback(
    async (machine: string, isBroken: boolean, note: string) => {
      try {
        const cur = broken[machine];
        if (isBroken && !cur) await statuses.add({ machine, broken: true, ...(note ? { note } : {}) });
        if (!isBroken && cur) await statuses.remove(cur.id);
        toast(isBroken ? "המכונה סומנה כתקולה" : "המכונה סומנה כתקינה");
        await loadStatus();
      } catch (e) {
        toast(`שגיאה: ${(e as Error).message}`);
      }
    },
    [broken, statuses, loadStatus, toast],
  );

  return {
    me,
    canModerate: me?.role === "commander" || me?.role === "admin",
    byDay,
    legacyOf,
    nameOf,
    mine,
    broken,
    loadDay,
    usedInWeek,
    book,
    cancel,
    setSeats,
    setMachineBroken,
    machines: MACHINES,
  };
}
export type Laundry = ReturnType<typeof useLaundry>;
