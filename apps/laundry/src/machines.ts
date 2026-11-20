// Machines: a washer on floor 1, a washer on floor 3, one dryer. Keep in sync with the "machine" enum in ../app.json.
// Ids: w* = washer, d* = dryer — the app.json schema enforces that kind matches the id.
export type Kind = "washer" | "dryer";
export interface Machine {
  id: string;
  label: string;
  /** Column header in the calendar. */
  short: string;
  kind: Kind;
}

export const MACHINES: Machine[] = [
  { id: "w1", label: "כביסה · קומה 1", short: "קומה 1", kind: "washer" },
  { id: "w3", label: "כביסה · קומה 3", short: "קומה 3", kind: "washer" },
  { id: "d1", label: "מייבש", short: "מייבש", kind: "dryer" },
];
export const machineById = (id: string) => MACHINES.find((m) => m.id === id);
export const KIND_LABEL: Record<Kind, { one: string; many: string }> = {
  washer: { one: "כביסה", many: "כביסות" },
  dryer: { one: "ייבוש", many: "ייבושים" },
};

/** 40-minute slots, Israel time (06:00, 06:40, 07:20 … 23:20–24:00). Also the "time" pattern in app.json. */
export const SLOT_MINUTES = 40;
export const FIRST_HOUR = 6;
export const END_HOUR = 24; // the last slot ends at midnight
export const DAYS_AHEAD = 7; // days shown by the finder's "השבוע"
/** How far ahead bookings are allowed — also "window.maxDaysAhead" in app.json (enforced by the server). */
export const BOOK_DAYS_AHEAD = 28;
export const WEEKLY_LIMIT = 2; // per kind — also in app.json "quota"
export const REMINDER_MINUTES = 10;

export const SLOTS: string[] = [];
for (let t = FIRST_HOUR * 60; t + SLOT_MINUTES <= END_HOUR * 60; t += SLOT_MINUTES) {
  SLOTS.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
}

export const TIME_OF_DAY = [
  { key: "any", label: "כל היום", from: 0, to: 24 },
  { key: "morning", label: "בוקר", from: 6, to: 12 },
  { key: "noon", label: "צהריים", from: 12, to: 17 },
  { key: "evening", label: "ערב", from: 17, to: 21 },
  { key: "night", label: "לילה", from: 21, to: 24 },
] as const;
