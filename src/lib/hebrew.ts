// Hebrew-aware search normalization (plan 07): ignores niqqud/cantillation,
// quote / geresh / gershayim differences (לו"ז = לוז = לו״ז) and final letters.
const FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };

export function normalizeHe(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[֑-ׇ]/g, (c) => (c === "־" ? " " : "")) // niqqud + cantillation; maqaf → space
    .replace(/["'`´׳״‘’“”]/g, "")
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[-_/.,:;()[\]{}!?#]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Every word of the query must appear somewhere in the haystack. */
export function matchesQuery(haystack: string[], query: string): boolean {
  const q = normalizeHe(query);
  if (!q) return true;
  const hay = normalizeHe(haystack.join(" "));
  return q.split(" ").every((w) => hay.includes(w));
}
