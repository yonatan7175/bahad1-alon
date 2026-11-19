"use client";
// Live floor map. Phone-first: the two corridors run top→bottom, so 20 rooms fit 360 px
// with big tap targets. RTL: odd side on the right, even side on the left, x37 faces x38.
//
//            שירותים (צד 37/38)
//   x37 ┃ odd ┃  inner   ┃ even ┃ x38
//   …   ┃corr.┃  area    ┃corr. ┃ …
//   x45 ┃     ┃          ┃      ┃ x46
//            לובי / מדרגות
//   x47 ┃     ┃          ┃      ┃ x48
//   …                             …
//            שירותים (צד 55/56)
import { CheckCircle2, DoorOpen, House } from "lucide-react";
import { HALF_ROWS, PLANS, areaById, type Area, type Floor } from "./building";
import { itemById } from "./items";
import { roomState, type Dorm, type RoomState } from "./data";

const STATE_CLS: Record<RoomState, string> = {
  fault: "border-danger/50 bg-danger-soft text-danger",
  missing: "border-warning/50 bg-warning-soft text-warning",
  ok: "border-success/45 bg-success-soft text-success",
  unknown: "border-line bg-surface text-fg",
};
export const STATE_LABEL: Record<RoomState, string> = {
  fault: "תקלה פתוחה",
  missing: "חסר ציוד/מתכלים",
  ok: "אושר היום — תקין",
  unknown: "עוד לא אישרו היום",
};

function Emojis({ d, id, max = 3 }: { d: Dorm; id: string; max?: number }) {
  const list = d.openByRoom.get(id) ?? [];
  if (!list.length) return null;
  const shown = list.slice(0, max);
  return (
    <span className="flex items-center gap-0.5 text-[13px] leading-none" aria-hidden="true">
      {shown.map((t) => (
        <span key={t.id}>{itemById(t.data.item)?.emoji}</span>
      ))}
      {list.length > max ? <span className="text-[10px] font-bold">+{list.length - max}</span> : null}
    </span>
  );
}

function RoomCell({ d, id, mine, onOpen }: { d: Dorm; id: string; mine: boolean; onOpen: (a: Area) => void }) {
  const state = roomState(d, id);
  const open = d.openByRoom.get(id) ?? [];
  const checked = d.checkByRoom.has(id);
  const a = areaById(id)!;
  const label = `חדר ${id}: ${STATE_LABEL[state]}${open.length ? `, ${open.length} פניות פתוחות` : ""}${checked ? ", אושר היום" : ""}${mine ? " (החדר שלך)" : ""}`;
  return (
    <button
      type="button"
      onClick={() => onOpen(a)}
      aria-label={label}
      className={`relative flex min-h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-[10px] border-2 px-1 py-1 font-extrabold tabular-nums shadow-[var(--shadow-sm)] transition-transform active:scale-95 ${STATE_CLS[state]} ${
        mine ? "outline outline-[3px] outline-offset-2 outline-accent" : ""
      }`}
    >
      <span className="text-[15px] leading-none">{id}</span>
      <Emojis d={d} id={id} />
      {state === "fault" ? (
        <span className="absolute -top-1 -end-1 flex size-3" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" />
          <span className="relative inline-flex size-3 rounded-full bg-danger" />
        </span>
      ) : null}
      {checked ? <CheckCircle2 className="absolute -bottom-1.5 -start-1.5 size-4 rounded-full bg-surface text-success" aria-hidden="true" /> : null}
      {mine ? (
        <span className="absolute -top-2 start-1 rounded-full bg-accent px-1.5 text-[9px] font-bold leading-4 text-accent-contrast" aria-hidden="true">
          שלי
        </span>
      ) : null}
    </button>
  );
}

function SharedCell({ d, area, onOpen, className = "" }: { d: Dorm; area: Area; onOpen: (a: Area) => void; className?: string }) {
  const open = d.openByRoom.get(area.id) ?? [];
  const hasFault = open.some((t) => itemById(t.data.item)?.group === "fault");
  return (
    <button
      type="button"
      onClick={() => onOpen(area)}
      aria-label={`${area.label}${open.length ? `: ${open.length} פניות פתוחות` : ""}`}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-dashed px-3 text-xs font-bold transition-transform active:scale-[0.98] ${
        open.length ? (hasFault ? "border-danger/50 bg-danger-soft text-danger" : "border-warning/50 bg-warning-soft text-warning") : "border-line-strong bg-surface-2 text-muted"
      } ${className}`}
    >
      {area.kind === "lobby" ? <DoorOpen className="size-4" aria-hidden="true" /> : <span aria-hidden="true">🚻</span>}
      {area.kind === "lobby" ? "לובי · מדרגות" : "שירותים"}
      <Emojis d={d} id={area.id} />
    </button>
  );
}

export function FloorMap({ d, floor, myRoom, onOpen }: { d: Dorm; floor: Floor; myRoom: string | null; onOpen: (a: Area) => void }) {
  const p = PLANS[floor];
  const half = (arr: string[], h: 0 | 1) => arr.slice(h * HALF_ROWS, (h + 1) * HALF_ROWS);
  const corridor = "rounded-full bg-[repeating-linear-gradient(180deg,var(--border-strong)_0_6px,transparent_6px_14px)] w-[3px] mx-auto";
  const block = (h: 0 | 1) => (
    <div className="grid grid-cols-[1fr_18px_minmax(44px,0.8fr)_18px_1fr] gap-x-1">
      <div className="space-y-2">
        {half(p.odd, h).map((id) => (
          <RoomCell key={id} d={d} id={id} mine={id === myRoom} onOpen={onOpen} />
        ))}
      </div>
      <div className={corridor} aria-hidden="true" />
      <div
        className="flex items-center justify-center rounded-[14px] border border-line bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:10px_10px] text-[10px] font-semibold text-subtle [writing-mode:vertical-rl]"
        aria-hidden="true"
      >
        שטח פנימי
      </div>
      <div className={corridor} aria-hidden="true" />
      <div className="space-y-2">
        {half(p.even, h).map((id) => (
          <RoomCell key={id} d={d} id={id} mine={id === myRoom} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );

  return (
    <section aria-label={`מפת קומה ${floor}`} className="rounded-card border border-line bg-bg-elevated p-3 shadow-[var(--shadow)]">
      <div className="mb-2 grid grid-cols-2 text-center text-[11px] font-bold text-muted">
        <span>צד אי-זוגי</span>
        <span>צד זוגי</span>
      </div>
      <div className="space-y-2">
        <SharedCell d={d} area={p.wc1} onOpen={onOpen} className="w-full" />
        {block(0)}
        <SharedCell d={d} area={p.lobby} onOpen={onOpen} className="w-full py-2" />
        {block(1)}
        <SharedCell d={d} area={p.wc2} onOpen={onOpen} className="w-full" />
      </div>
    </section>
  );
}

export function Legend() {
  const items: RoomState[] = ["fault", "missing", "ok", "unknown"];
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted" aria-label="מקרא">
      {items.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className={`size-3 rounded-[4px] border-2 ${STATE_CLS[s]}`} aria-hidden="true" />
          {STATE_LABEL[s]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <House className="size-3.5 text-accent" aria-hidden="true" /> מסגרת ירוקה = החדר שלך
      </li>
    </ul>
  );
}
