import { describe, expect, it } from "vitest";
import { Ajv } from "ajv";
import manifest from "../../apps/laundry/app.json";
import { legacyInSlot, legacyRange, overlapsSlot, slotsFor, toMin } from "../../apps/laundry/src/legacy";

describe("laundry: bookings carried over from the old calendar", () => {
  it("blocks every 40-minute slot the old booking touches, not the ones it only borders", () => {
    expect(slotsFor({ from: "18:00", to: "19:00" })).toEqual(["18:00", "18:40"]);
    expect(slotsFor({ from: "21:30", to: "22:00" })).toEqual(["21:20"]);
    expect(slotsFor({ from: "22:30", to: "23:00" })).toEqual(["22:00", "22:40"]);
    expect(slotsFor({ from: "11:35", to: "12:10" })).toEqual(["11:20", "12:00"]);
    expect(slotsFor({ from: "23:00", to: "24:00" })).toEqual(["22:40", "23:20"]);
    expect(slotsFor({ from: "18:40", to: "19:20" })).toEqual(["18:40"]); // exactly one slot
    expect(overlapsSlot({ from: "19:20", to: "20:00" }, "18:40")).toBe(false); // touching ends
    expect(overlapsSlot({ from: "18:00", to: "18:41" }, "18:40")).toBe(true); // one minute is enough
    expect(slotsFor({ from: "05:00", to: "05:30" })).toEqual([]); // before opening hours
  });

  it("lists the old bookings inside a slot by start time, and shows midnight as 00:00", () => {
    const rec = (machine: string, from: string, to: string, name: string) => ({ data: { machine, day: "2026-11-21", from, to, name } });
    const list = [rec("w1", "19:00", "19:30", "ב"), rec("w1", "18:00", "19:00", "א"), rec("d1", "18:00", "19:00", "מייבש")];
    expect(legacyInSlot(list, "w1", "2026-11-21", "18:40").map((r) => r.data.name)).toEqual(["א", "ב"]);
    expect(legacyInSlot(list, "w1", "2026-11-22", "18:40")).toEqual([]);
    expect(legacyRange({ from: "23:00", to: "24:00" })).toBe("23:00–00:00");
    expect(toMin("24:00")).toBe(1440);
  });

  it("only admins write the carried-over list; its schema accepts real (off-grid) times", () => {
    const c = manifest.collections.legacy;
    expect(c.create).toBe("admin");
    expect(c.read).toBe("all");
    const v = new Ajv({ strict: false }).compile(c.schema);
    expect(v({ machine: "w1", day: "2026-11-22", from: "11:35", to: "12:10", name: "טוני", phones: ["054-1234567"] })).toBe(true);
    expect(v({ machine: "w1", day: "2026-11-21", from: "23:00", to: "24:00", name: "אורי" })).toBe(true);
    expect(v({ machine: "w3", day: "2026-11-21", from: "23:00", to: "24:00", name: "x" })).toBe(false);
    expect(v({ machine: "w1", day: "2026-11-21", from: "23:00", to: "24:00", name: "x", seats: 2 })).toBe(false);
  });
});
