// Public (client-safe) site settings. Values come from NEXT_PUBLIC_* env vars; see .env.example.
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "אתר הבית — גדוד אלון";
export const SITE_SHORT_NAME = process.env.NEXT_PUBLIC_SITE_SHORT_NAME || "גדוד אלון";
/** The school, shown next to the battalion name everywhere. */
export const SCHOOL_NAME = process.env.NEXT_PUBLIC_SCHOOL_NAME || "בה״ד 1";
/**
 * Optional emblem image (e.g. "/brand/emblem.svg" in public/). Leave EMPTY until the use of the
 * official בה״ד 1 / battalion insignia on this unofficial site is approved (plan Q1 + קב"ם).
 * When empty, the original placeholder oak mark is shown.
 */
export const EMBLEM_URL = process.env.NEXT_PUBLIC_EMBLEM_URL || "";
/** Where "דווח על בעיה" / the footer contact link go. GitHub repo URL preferred (issues). */
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL || "";
export const CONTACT_URL = process.env.NEXT_PUBLIC_CONTACT_URL || (REPO_URL ? `${REPO_URL}/issues` : "");
/** Battalion accent (placeholder until supplied, plan Q1). */
export const THEME_COLOR = process.env.NEXT_PUBLIC_THEME_COLOR || "#2f6b4f";

export const ROLE_LABEL: Record<string, string> = { cadet: "חניך/ה", commander: "מפקד/ת", admin: "מנהל/ת" };
export const STATUS_LABEL: Record<string, string> = { pending: "ממתין לאישור", approved: "מאושר", blocked: "חסום" };
export const SCOPE_LABEL: Record<string, string> = {
  profile: "שם ותמונה",
  role: "תפקיד (חניך/מפקד/מנהל)",
  unit: "פלוגה ומחלקה",
  contact: "אימייל וטלפון",
  data: "שמירת נתונים באפליקציה",
  push: "שליחת התראות",
  directory: "כרטיסי משתמשים (שם, יחידה, טלפון — לפי הגדרות הפרטיות)",
};
export const ERROR_LABEL: Record<string, string> = {
  unauthorized: "צריך להתחבר מחדש",
  forbidden: "אין הרשאה לפעולה הזו",
  not_found: "לא נמצא",
  invalid: "בקשה לא תקינה",
  rate_limited: "יותר מדי פעולות — נסו שוב בעוד רגע",
  app_disabled: "האפליקציה הושבתה זמנית על ידי מנהל",
  conflict: "מישהו אחר תפס את זה רגע לפניך",
};

export function reportUrl(slug?: string): string {
  if (REPO_URL) {
    const title = encodeURIComponent(slug ? `[${slug}] ` : "");
    return `${REPO_URL}/issues/new?title=${title}`;
  }
  return CONTACT_URL;
}
