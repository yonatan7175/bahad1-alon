"use client";
// Data layer of the dorm app. Three collections (rules in ../app.json, enforced by the server):
//  tickets — one OPEN request per room+item (unique room+item+slot; slot = "open" until closed),
//  plus    — "me too" on someone else's request (unique ticket+by),
//  checks  — the room's daily "everything was handled" confirmation (unique room+day, today only).
// Only app managers (the battalion logistics officer) and admins moderate: reply / in progress / close.
import { useCallback, useEffect, useMemo, useState } from "react";
import { BahadError, useBahad, type BahadRecord, type Me } from "@/platform/client";
import { areaById } from "./building";
import { itemById, type Status } from "./items";

export type Ticket = {
  room: string;
  item: string;
  note?: string;
  status: Status;
  slot: string;
  reply?: string;
  handledBy?: string;
  closedAt?: string;
};
export type Plus = { ticket: string; by: string };
export type Check = { room: string; day: string };
export type TicketRec = BahadRecord<Ticket>;
export type CheckRec = BahadRecord<Check>;

/** "YYYY-MM-DD" in Israel. */
export const israelDay = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const valid = (r: TicketRec) => !!areaById(r.data.room) && !!itemById(r.data.item);
const errCode = (e: unknown) => (e instanceof BahadError ? e.code : null);

export function useDorm() {
  const bahad = useBahad();
  const tickets = useMemo(() => bahad.data.collection<Ticket>("tickets"), [bahad]);
  const plus = useMemo(() => bahad.data.collection<Plus>("plus"), [bahad]);
  const checks = useMemo(() => bahad.data.collection<Check>("checks"), [bahad]);

  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState<TicketRec[] | null>(null);
  const [closed, setClosed] = useState<TicketRec[]>([]);
  const [pluses, setPluses] = useState<BahadRecord<Plus>[]>([]);
  const [today, setToday] = useState(() => israelDay());
  const [todayChecks, setTodayChecks] = useState<CheckRec[]>([]);
  const toast = useCallback((m: string) => bahad.ui.toast(m), [bahad]);

  const loadTickets = useCallback(async () => {
    // By status, not slot: free-text items ("repeatable") stay open under their own uuid slot.
    const [o, p, c] = await Promise.all([
      tickets.list({ where: { status: "open" }, order: "createdAt:asc", limit: 200 }),
      tickets.list({ where: { status: "in_progress" }, order: "createdAt:asc", limit: 200 }),
      tickets.list({ where: { status: "closed" }, order: "updatedAt:desc", limit: 150 }),
    ]);
    setOpen([...o, ...p].filter(valid).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    setClosed(c.filter(valid));
  }, [tickets]);
  const loadPlus = useCallback(async () => setPluses(await plus.list({ limit: 200 })), [plus]);
  const loadChecks = useCallback(async () => {
    const day = israelDay();
    setToday(day);
    setTodayChecks(await checks.list({ where: { day }, limit: 200 }));
  }, [checks]);

  useEffect(() => {
    bahad.user.me().then(setMe).catch(() => toast("לא הצלחנו לטעון את הפרטים שלך"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async: state is set after the fetch resolves
    loadTickets().catch(() => toast("לא הצלחנו לטעון את הפניות"));
    loadPlus().catch(() => {});
    loadChecks().catch(() => {});
    const s1 = tickets.subscribe(() => void loadTickets().catch(() => {}));
    const s2 = plus.subscribe(() => void loadPlus().catch(() => {}));
    const s3 = checks.subscribe(() => void loadChecks().catch(() => {}));
    // A new day starts a new confirmation round.
    const t = setInterval(() => {
      if (israelDay() !== today) void loadChecks().catch(() => {});
    }, 60_000);
    return () => {
      s1();
      s2();
      s3();
      clearInterval(t);
    };
  }, [bahad, tickets, plus, checks, loadTickets, loadPlus, loadChecks, toast, today]);

  /** +1s per open ticket id (distinct people, the opener not counted). */
  const plusBy = useMemo(() => {
    const m = new Map<string, BahadRecord<Plus>[]>();
    for (const p of pluses) {
      const arr = m.get(p.data.ticket) ?? [];
      if (!arr.some((x) => x.owner.id === p.owner.id)) arr.push(p);
      m.set(p.data.ticket, arr);
    }
    return m;
  }, [pluses]);

  const openByRoom = useMemo(() => {
    const m = new Map<string, TicketRec[]>();
    for (const t of open ?? []) m.set(t.data.room, [...(m.get(t.data.room) ?? []), t]);
    return m;
  }, [open]);
  const checkByRoom = useMemo(() => new Map(todayChecks.map((c) => [c.data.room, c])), [todayChecks]);

  const findOpen = useCallback(
    (room: string, item: string) => (open ?? []).find((t) => t.data.room === room && t.data.item === item && t.data.slot === "open"),
    [open],
  );

  // ── cadet actions ──────────────────────────────────────────────────────────

  const addPlus = useCallback(
    async (t: TicketRec): Promise<boolean> => {
      if (!me) return false;
      try {
        await plus.add({ ticket: t.id, by: me.id });
        await loadPlus();
        toast("נוסף +1 — הקל\"ג יראה שזה חשוב");
        return true;
      } catch (e) {
        if (errCode(e) === "conflict") toast("כבר סימנת +1 על הפנייה הזו");
        else toast("לא הצלחנו להוסיף +1");
        return false;
      }
    },
    [me, plus, loadPlus, toast],
  );

  const removePlus = useCallback(
    async (t: TicketRec) => {
      const mine = (plusBy.get(t.id) ?? []).find((p) => p.mine);
      if (!mine) return;
      try {
        await plus.remove(mine.id);
        await loadPlus();
      } catch {
        toast("לא הצלחנו לבטל");
      }
    },
    [plusBy, plus, loadPlus, toast],
  );

  const report = useCallback(
    async (room: string, itemId: string, note: string): Promise<boolean> => {
      const item = itemById(itemId);
      if (!item) return false;
      const clean = note.replace(/\s+/g, " ").trim().slice(0, 200);
      const data: Ticket = { room, item: itemId, status: "open", slot: item.repeatable ? crypto.randomUUID() : "open" };
      if (clean) data.note = clean;
      try {
        await tickets.add(data);
        await loadTickets();
        toast(`${item.emoji} הפנייה נשלחה לקל"ג`);
        return true;
      } catch (e) {
        if (errCode(e) === "conflict") {
          // Someone in the room reported the same thing a moment ago — count us in instead.
          await loadTickets();
          const existing = (await tickets.list({ where: { room, item: itemId, slot: "open" }, limit: 1 }))[0];
          if (existing) return addPlus(existing);
          toast("כבר קיימת פנייה פתוחה כזו");
        } else if (errCode(e) === "rate_limited") toast("יותר מדי פעולות — נסו שוב בעוד דקה");
        else toast("לא הצלחנו לשלוח את הפנייה");
        return false;
      }
    },
    [tickets, loadTickets, toast, addPlus],
  );

  /** The opener withdraws a request that is still open (e.g. reported by mistake). */
  const withdraw = useCallback(
    async (t: TicketRec) => {
      try {
        await tickets.remove(t.id);
        await loadTickets();
        toast("הפנייה בוטלה");
      } catch {
        toast("לא הצלחנו לבטל את הפנייה");
      }
    },
    [tickets, loadTickets, toast],
  );

  const confirmRoom = useCallback(
    async (room: string): Promise<boolean> => {
      try {
        await checks.add({ room, day: israelDay() });
        await loadChecks();
        toast("✅ אושר — תודה! הקל\"ג רואה שהחדר תקין היום");
        return true;
      } catch (e) {
        if (errCode(e) === "conflict") {
          await loadChecks();
          toast("מישהו מהחדר כבר אישר היום");
        } else toast("לא הצלחנו לשמור את האישור");
        return false;
      }
    },
    [checks, loadChecks, toast],
  );

  const undoConfirm = useCallback(
    async (c: CheckRec) => {
      try {
        await checks.remove(c.id);
        await loadChecks();
      } catch {
        toast("לא הצלחנו לבטל את האישור");
      }
    },
    [checks, loadChecks, toast],
  );

  // ── manager actions (the server rejects these for everyone else) ──────────

  const setStatus = useCallback(
    async (t: TicketRec, status: "open" | "in_progress") => {
      try {
        await tickets.update(t.id, { status, handledBy: me?.name.slice(0, 40) });
        await loadTickets();
      } catch {
        toast("לא הצלחנו לעדכן");
      }
    },
    [tickets, me, loadTickets, toast],
  );

  const setReply = useCallback(
    async (t: TicketRec, reply: string): Promise<boolean> => {
      try {
        await tickets.update(t.id, { reply: reply.replace(/\s+/g, " ").trim().slice(0, 200), handledBy: me?.name.slice(0, 40) });
        await loadTickets();
        toast("התגובה נשמרה");
        return true;
      } catch {
        toast("לא הצלחנו לשמור את התגובה");
        return false;
      }
    },
    [tickets, me, loadTickets, toast],
  );

  /** Closes requests (slot ← its own id, so the room can report the same item again later). */
  const closeMany = useCallback(
    async (list: TicketRec[], reply?: string) => {
      let ok = 0;
      for (const t of list) {
        try {
          const patch: Partial<Ticket> = { status: "closed", slot: t.id, closedAt: new Date().toISOString(), handledBy: me?.name.slice(0, 40) };
          if (reply) patch.reply = reply.slice(0, 200);
          await tickets.update(t.id, patch);
          ok++;
        } catch (e) {
          if (errCode(e) === "rate_limited") {
            toast("הגעת למגבלת פעולות לדקה — המשך בעוד דקה");
            break;
          }
        }
      }
      await loadTickets();
      toast(ok === 1 ? "הפנייה נסגרה ✓" : `${ok} פניות נסגרו ✓`);
    },
    [tickets, me, loadTickets, toast],
  );

  const reopen = useCallback(
    async (t: TicketRec) => {
      try {
        await tickets.update(t.id, { status: "open", slot: itemById(t.data.item)?.repeatable ? crypto.randomUUID() : "open" });
        await loadTickets();
      } catch (e) {
        toast(errCode(e) === "conflict" ? "יש כבר פנייה פתוחה כזו לחדר" : "לא הצלחנו לפתוח מחדש");
      }
    },
    [tickets, loadTickets, toast],
  );

  return {
    me,
    isManager: !!me?.manager,
    open,
    closed,
    today,
    todayChecks,
    openByRoom,
    checkByRoom,
    plusBy,
    findOpen,
    report,
    addPlus,
    removePlus,
    withdraw,
    confirmRoom,
    undoConfirm,
    setStatus,
    setReply,
    closeMany,
    reopen,
  };
}

export type Dorm = ReturnType<typeof useDorm>;

/** Room state for the map colors. */
export type RoomState = "fault" | "missing" | "ok" | "unknown";
export function roomState(d: Dorm, room: string): RoomState {
  const list = d.openByRoom.get(room) ?? [];
  if (list.some((t) => itemById(t.data.item)?.group === "fault")) return "fault";
  if (list.length) return "missing";
  if (d.checkByRoom.has(room)) return "ok";
  return "unknown";
}

const rtf = new Intl.RelativeTimeFormat("he", { numeric: "auto" });
export function ago(iso: string, now = Date.now()): string {
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return "עכשיו";
  if (min === 1) return "לפני דקה";
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.round(min / 60);
  if (h === 1) return "לפני שעה";
  if (h < 24) return rtf.format(-h, "hour");
  return rtf.format(-Math.round(h / 24), "day");
}
export const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
