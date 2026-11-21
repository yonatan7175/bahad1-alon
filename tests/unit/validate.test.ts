import { describe, expect, it } from "vitest";
import { normalizePhone, normalizeRoom, validHebrewName } from "@/lib/validate";

describe("profile validation", () => {
  it("accepts Hebrew names, rejects others", () => {
    expect(validHebrewName("  ישראל   ישראלי ")).toBe("ישראל ישראלי");
    expect(validHebrewName("בן-דוד")).toBe("בן-דוד");
    expect(validHebrewName("ז'קלין")).toBe("ז'קלין");
    expect(validHebrewName("Israel")).toBeNull();
    expect(validHebrewName("י")).toBeNull();
    expect(validHebrewName("<script>")).toBeNull();
    expect(validHebrewName("א".repeat(41))).toBeNull();
  });
  it("normalizes Israeli mobile numbers", () => {
    expect(normalizePhone("0501234567")).toBe("050-1234567");
    expect(normalizePhone("050-123 4567")).toBe("050-1234567");
    expect(normalizePhone("+972501234567")).toBe("050-1234567");
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("03-1234567")).toBeUndefined();
    expect(normalizePhone("05012")).toBeUndefined();
  });
});

describe("normalizeRoom (living quarters: floors 2–4, rooms 37–60)", () => {
  it("accepts rooms of the building", () => {
    for (const r of ["237", "256", "341", "437", "456", "257", "360", "460", " 2 4 1 "]) expect(normalizeRoom(r)).toBe(r.replace(/\s/g, ""));
  });
  it("rejects anything else", () => {
    for (const r of ["", "236", "261", "461", "137", "537", "2410", "24a", "ב-7", "3/12"]) expect(normalizeRoom(r)).toBeNull();
  });
});
