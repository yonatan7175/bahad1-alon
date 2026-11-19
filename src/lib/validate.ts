// Shared form validation for profile details (onboarding, profile, admin).
const HEBREW_NAME = /^[א-תװ-״'"׳״\-\s]+$/;

export function validHebrewName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 40) return null;
  if (!HEBREW_NAME.test(name)) return null;
  if ((name.match(/[א-ת]/g) ?? []).length < 2) return null;
  return name;
}

/** Rooms of the battalion's living quarters: floors 2–4, rooms <floor>37–<floor>56 (e.g. 237, 341, 456). */
export const DORM_FLOORS = [2, 3, 4] as const;
export const DORM_FIRST = 37;
export const DORM_LAST = 56;

/** Room number in the living quarters (e.g. 241). null = not a room in the building. */
export function normalizeRoom(raw: string): string | null {
  const room = raw.replace(/\s+/g, "").trim();
  if (!/^\d{3}$/.test(room)) return null;
  const floor = Number(room[0]);
  const n = Number(room.slice(1));
  return (DORM_FLOORS as readonly number[]).includes(floor) && n >= DORM_FIRST && n <= DORM_LAST ? room : null;
}

/** Team (צוות) number 1–30 → its platoon name "צוות <n>". null = invalid. */
export const MAX_TEAM = 30;
export function teamPlatoonName(raw: string): string | null {
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 1 && n <= MAX_TEAM ? `צוות ${n}` : null;
}

/** Israeli mobile number → "05X-XXXXXXX", "" → null (optional), invalid → undefined. */
export function normalizePhone(raw: string): string | null | undefined {
  const digits = raw.replace(/[\s\-().]/g, "").replace(/^\+972/, "0");
  if (digits === "") return null;
  if (!/^05\d{8}$/.test(digits)) return undefined;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}
