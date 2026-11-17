import { describe, expect, it } from "vitest";
import { dayLabel, israelDay, israelHour, israelIso, israelOffsetMinutes, israelTime, nextDays } from "@apps/laundry/src/time";

describe("laundry Israel-time helpers", () => {
  it("knows winter (+2) and summer (+3) offsets", () => {
    expect(israelOffsetMinutes(new Date("2026-01-15T12:00:00Z"))).toBe(120);
    expect(israelOffsetMinutes(new Date("2026-07-15T12:00:00Z"))).toBe(180);
  });
  it("israelTime / israelIso round-trip in winter and summer", () => {
    expect(israelTime("2026-11-20", 18).toISOString()).toBe("2026-11-20T16:00:00.000Z");
    expect(israelIso("2026-11-20", 18)).toBe("2026-11-20T18:00:00+02:00");
    expect(israelTime("2026-07-01", 6).toISOString()).toBe("2026-07-01T03:00:00.000Z");
    expect(israelIso("2026-07-01", 6)).toBe("2026-07-01T06:00:00+03:00");
    expect(new Date(israelIso("2026-07-01", 6)).getTime()).toBe(israelTime("2026-07-01", 6).getTime());
  });
  it("handles the DST switch days", () => {
    // Israel 2026: DST starts Fri 2026-03-27 02:00, ends Sun 2026-10-25 02:00
    expect(israelIso("2026-03-27", 10)).toBe("2026-03-27T10:00:00+03:00");
    expect(israelIso("2026-03-26", 10)).toBe("2026-03-26T10:00:00+02:00");
    expect(israelIso("2026-10-25", 10)).toBe("2026-10-25T10:00:00+02:00");
    expect(israelIso("2026-10-24", 10)).toBe("2026-10-24T10:00:00+03:00");
  });
  it("israelDay / israelHour use Israel time, not UTC", () => {
    const t = new Date("2026-11-20T23:30:00Z"); // 01:30 next day in Israel
    expect(israelDay(t)).toBe("2026-11-21");
    expect(israelHour(t)).toBe(1);
  });
  it("nextDays returns consecutive days across DST", () => {
    expect(nextDays(3, new Date("2026-10-24T08:00:00Z"))).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
  });
  it("labels", () => {
    expect(dayLabel("2026-11-20", "2026-11-20")).toBe("היום");
    expect(dayLabel("2026-11-21", "2026-11-20")).toBe("ש' 21.11");
  });
});

import { relativeFromNow, slotEnd, slotIso, slotStart, weekRange } from "@apps/laundry/src/time";

describe("laundry 30-minute slot helpers", () => {
  it("slotStart / slotIso handle half hours and DST", () => {
    expect(slotStart("2026-11-20", "18:30").toISOString()).toBe("2026-11-20T16:30:00.000Z");
    expect(slotIso("2026-11-20", "18:30")).toBe("2026-11-20T18:30:00+02:00");
    expect(slotIso("2026-07-01", "06:00")).toBe("2026-07-01T06:00:00+03:00");
    expect(new Date(slotIso("2026-07-01", "23:30")).getTime()).toBe(slotStart("2026-07-01", "23:30").getTime());
  });
  it("slotEnd", () => {
    expect(slotEnd("18:00")).toBe("18:30");
    expect(slotEnd("18:30")).toBe("19:00");
    expect(slotEnd("23:30")).toBe("00:00");
  });
  it("weekRange is Sunday–Saturday", () => {
    expect(weekRange("2026-11-22")).toEqual(["2026-11-22", "2026-11-28"]); // Sunday
    expect(weekRange("2026-11-28")).toEqual(["2026-11-22", "2026-11-28"]); // Saturday
    expect(weekRange("2026-11-21")).toEqual(["2026-11-15", "2026-11-21"]);
  });
  it("relativeFromNow", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    expect(relativeFromNow(new Date("2026-11-20T10:20:00Z"), now)).toBe("בעוד 20 דק'");
    expect(relativeFromNow(new Date("2026-11-20T12:00:00Z"), now)).toBe("בעוד שעתיים");
    expect(relativeFromNow(new Date("2026-11-21T10:00:00Z"), now)).toBe("מחר");
  });
});

import { addDays, monthGrid, monthLabel, weekDays } from "@apps/laundry/src/time";

describe("laundry calendar navigation helpers", () => {
  it("addDays crosses months/years", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("weekDays is Sunday..Saturday", () => {
    expect(weekDays("2026-11-18")).toEqual(["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]);
  });
  it("monthGrid: November 2026 starts on Sunday, 30 days, full weeks", () => {
    const g = monthGrid("2026-11-18");
    expect(g[0][0]).toBe("2026-11-01");
    expect(g.flat().filter(Boolean).length).toBe(30);
    expect(g.every((w) => w.length === 7)).toBe(true);
    const dec = monthGrid("2026-12-05"); // Dec 1 2026 is a Tuesday
    expect(dec[0].slice(0, 3)).toEqual([null, null, "2026-12-01"]);
  });
  it("monthLabel is Hebrew", () => {
    expect(monthLabel("2026-11-18")).toBe("נובמבר 2026");
  });
});
