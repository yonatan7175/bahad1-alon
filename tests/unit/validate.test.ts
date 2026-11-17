import { describe, expect, it } from "vitest";
import { normalizePhone, validHebrewName } from "@/lib/validate";

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
