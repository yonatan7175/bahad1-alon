// Shared form validation for profile details (onboarding, profile, admin).
const HEBREW_NAME = /^[א-תװ-״'"׳״\-\s]+$/;

export function validHebrewName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 40) return null;
  if (!HEBREW_NAME.test(name)) return null;
  if ((name.match(/[א-ת]/g) ?? []).length < 2) return null;
  return name;
}

/** Room number: digits/letters, optionally with "/" or "-" (e.g. 214, 3/12, ב-7). null = invalid. */
export function normalizeRoom(raw: string): string | null {
  const room = raw.replace(/\s+/g, "").trim();
  return /^[0-9A-Za-zא-ת/\-]{1,8}$/.test(room) ? room : null;
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
