// Machines (one shared set for now). Keep in sync with the "machine" enum in ../app.json.
// Ids: w* = washer, d* = dryer — the app.json schema enforces that kind matches the id.
export type Kind = "washer" | "dryer";
export interface Machine {
  id: string;
  label: string;
  kind: Kind;
}

export const MACHINES: Machine[] = [
  { id: "w1", label: "כביסה 1", kind: "washer" },
  { id: "w2", label: "כביסה 2", kind: "washer" },
  { id: "w3", label: "כביסה 3", kind: "washer" },
  { id: "w4", label: "כביסה 4", kind: "washer" },
  { id: "w5", label: "כביסה 5", kind: "washer" },
  { id: "d1", label: "מייבש 1", kind: "dryer" },
  { id: "d2", label: "מייבש 2", kind: "dryer" },
  { id: "d3", label: "מייבש 3", kind: "dryer" },
  { id: "d4", label: "מייבש 4", kind: "dryer" },
];
export const machineById = (id: string) => MACHINES.find((m) => m.id === id);
export const KIND_LABEL: Record<Kind, { one: string; many: string }> = {
  washer: { one: "כביסה", many: "כביסות" },
  dryer: { one: "ייבוש", many: "ייבושים" },
};

/** 30-minute slots, Israel time. */
export const SLOT_MINUTES = 30;
export const FIRST_HOUR = 6;
export const LAST_HOUR = 23; // last slot starts 23:30
export const DAYS_AHEAD = 7; // days shown by the finder's "השבוע"
/** How far ahead bookings are allowed — also "window.maxDaysAhead" in app.json (enforced by the server). */
export const BOOK_DAYS_AHEAD = 28;
export const WEEKLY_LIMIT = 2; // per kind — also in app.json "quota"
export const REMINDER_MINUTES = 10;

export const SLOTS: string[] = [];
for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) for (const m of [0, 30]) SLOTS.push(`${String(h).padStart(2, "0")}:${m ? "30" : "00"}`);

export const TIME_OF_DAY = [
  { key: "any", label: "כל היום", from: 0, to: 24 },
  { key: "morning", label: "בוקר", from: 6, to: 12 },
  { key: "noon", label: "צהריים", from: 12, to: 17 },
  { key: "evening", label: "ערב", from: 17, to: 21 },
  { key: "night", label: "לילה", from: 21, to: 24 },
] as const;
