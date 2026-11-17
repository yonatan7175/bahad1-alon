"use client";
// Data layer of the laundry app: bookings per day, my bookings, broken machines,
// and the actions (book / cancel / mark broken). All rules (one person per slot,
// 2 washes + 2 dries a week) are enforced by the server — see app.json "unique" / "quota".
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BahadError, useBahad, type BahadRecord, type Me } from "@/platform/client";
import { KIND_LABEL, MACHINES, REMINDER_MINUTES, SLOTS, WEEKLY_LIMIT, machineById, type Kind, type Machine } from "./machines";
import { dayLabel, israelDay, slotEnd, slotIso, slotStart, weekRange } from "./time";

export type Booking = { machine: string; kind: Kind; day: string; time: string; start: string; reminderId?: string };
export type Rec = BahadRecord<Booking>;
type Status = { machine: string; broken: boolean; note?: string };
export type StatusRec = BahadRecord<Status>;

const valid = (r: Rec) => typeof r.data.time === "string" && SLOTS.includes(r.data.time) && !!machineById(r.data.machine);

export function useLaundry() {
  const bahad = useBahad();
  const bookings = useMemo(() => bahad.data.collection<Booking>("bookings"), [bahad]);
  const statuses = useMemo(() => bahad.data.collection<Status>("machine_status"), [bahad]);
  const [me, setMe] = useState<Me | null>(null);
  const [byDay, setByDay] = useState<Record<string, Rec[]>>({});
  const [mine, setMine] = useState<Rec[] | null>(null);
  const [broken, setBroken] = useState<Record<string, StatusRec>>({});
  const loaded = useRef(new Set<string>());

  const loadDay = useCallback(
    async (day: string) => {
      const [w, d] = await Promise.all([
        bookings.list({ where: { day, kind: "washer" }, limit: 200 }),
        bookings.list({ where: { day, kind: "dryer" }, limit: 200 }),
      ]);
      loaded.current.add(day);
      setByDay((prev) => ({ ...prev, [day]: [...w, ...d].filter(valid) }));
    },
    [bookings],
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
    return () => {
      stop1();
      stop2();
    };
  }, [bahad, bookings, statuses, loadDay, loadMine, loadStatus, toast]);

  /** How many bookings of `kind` I have in the week containing `day`. */
  const usedInWeek = useCallback(
    (day: string, kind: Kind) => {
      const [from, to] = weekRange(day);
      return (mine ?? []).filter((r) => r.data.kind === kind && r.data.day >= from && r.data.day <= to).length;
    },
    [mine],
  );

  const book = useCallback(
    async (m: Machine, day: string, time: string): Promise<boolean> => {
      try {
        const rec = await bookings.add({ machine: m.id, kind: m.kind, day, time, start: slotIso(day, time) });
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
        toast(`שוריין ✔ ${m.label}, ${time}`);
        await Promise.all([loadDay(day), loadMine()]);
        return true;
      } catch (e) {
        const code = e instanceof BahadError ? e.code : undefined;
        if (code === "conflict") toast("המשבצת נתפסה רגע לפניך — בחרו אחרת");
        else if (code === "rate_limited") toast(`הגעת למכסה: ${WEEKLY_LIMIT} ${KIND_LABEL[m.kind].many} בשבוע (א'–ש')`);
        else toast(`שגיאה: ${(e as Error).message}`);
        await loadDay(day).catch(() => {});
        return false;
      }
    },
    [bahad, bookings, loadDay, loadMine, toast],
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
    mine,
    broken,
    loadDay,
    usedInWeek,
    book,
    cancel,
    setMachineBroken,
    machines: MACHINES,
  };
}
export type Laundry = ReturnType<typeof useLaundry>;
