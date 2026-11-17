import { describe, expect, it } from "vitest";
import { matchesQuery, normalizeHe } from "@/lib/hebrew";

describe("Hebrew search normalization", () => {
  it("treats quote, geresh and gershayim the same", () => {
    expect(normalizeHe('לו"ז')).toBe(normalizeHe("לוז"));
    expect(normalizeHe("לו״ז")).toBe("לוז");
    expect(normalizeHe("צה׳׳ל")).toBe(normalizeHe("צהל"));
  });
  it("ignores niqqud and cantillation", () => {
    expect(normalizeHe("שָׁלוֹם")).toBe(normalizeHe("שלום"));
    expect(normalizeHe("בְּרֵאשִׁית")).toBe("בראשית");
  });
  it("ignores final-letter differences so partial words match", () => {
    expect(matchesQuery(["ריכוז חוסרים"], "חוסרימ")).toBe(true);
    expect(matchesQuery(["כסף"], "כספ")).toBe(true);
  });
  it("needs every word; is case-insensitive for Latin", () => {
    expect(matchesQuery(["לו\"ז מכונות כביסה", "שריון תור"], "כביסה לוז")).toBe(true);
    expect(matchesQuery(["לו\"ז מכונות כביסה"], "כביסה ניווט")).toBe(false);
    expect(matchesQuery(["AI tutor"], "ai")).toBe(true);
    expect(matchesQuery(["x"], "   ")).toBe(true);
  });
  it("handles Hebrew presentation forms (NFKD)", () => {
    expect(normalizeHe("אַ")).toBe("א"); // אַ presentation form
  });
});
