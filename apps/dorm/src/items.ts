// What can be reported. Keep the "item" enum in ../app.json in sync.
export type Group = "supply" | "equipment" | "fault";
export interface Item {
  id: string;
  label: string;
  /** Short label for chips and the map. */
  short: string;
  emoji: string;
  group: Group;
  /** Free text: the cadet writes what is missing / broken (the note is required). */
  needsNote?: boolean;
  /** Can be reported again while one is open (no "same item already reported" dedupe). */
  repeatable?: boolean;
}

export const ITEMS: Item[] = [
  { id: "toilet_paper", label: "נייר טואלט", short: "נייר טואלט", emoji: "🧻", group: "supply" },
  { id: "trash_bags", label: "שקיות זבל", short: "שקיות זבל", emoji: "🗑️", group: "supply" },
  { id: "bucket", label: "חסר דלי", short: "דלי", emoji: "🪣", group: "equipment" },
  { id: "mop", label: "חסר מגב", short: "מגב", emoji: "🧹", group: "equipment" },
  { id: "other_missing", label: "חסר משהו אחר", short: "חסר", emoji: "📦", group: "equipment", needsNote: true, repeatable: true },
  { id: "lamp", label: "מנורה להחלפה", short: "מנורה", emoji: "💡", group: "fault" },
  { id: "heating", label: "ההסקה לא עובדת", short: "הסקה", emoji: "🔥", group: "fault" },
  { id: "other", label: "תקלה אחרת", short: "תקלה", emoji: "🛠️", group: "fault", needsNote: true, repeatable: true },
];
const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const itemById = (id: string) => BY_ID.get(id);

export const GROUP_LABEL: Record<Group, string> = {
  supply: "מתכלים — מתמלא כל הזמן",
  equipment: "ציוד חסר",
  fault: "תקלות תחזוקה",
};

export type Status = "open" | "in_progress" | "closed";
export const STATUS_LABEL: Record<Status, string> = { open: "פתוחה", in_progress: "בטיפול", closed: "טופלה" };
