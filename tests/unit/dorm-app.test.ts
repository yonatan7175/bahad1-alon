// The dorm app's server-side rules (apps/dorm/app.json), run through the real engine:
// one open request per room+item, only the logistics officer (app manager) closes,
// one daily confirmation per room, today only. Also keeps building.ts ↔ app.json in sync.
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/generated/registry", async () => {
  const { effectiveScopes, manifestSchema } = await import("@/platform/manifest");
  const json = (await import("../../apps/dorm/app.json")).default;
  const m = manifestSchema.parse(json);
  return { REGISTRY: [{ ...m, effectiveScopes: effectiveScopes(m), iconUrl: "/app-icons/dorm.svg" }], TAGS: [] };
});
import manifest from "../../apps/dorm/app.json";
import { executeCall, israelToday } from "@/platform/server/engine";
import type { Db } from "@/platform/server/db-core";
import { AREAS, ROOMS, ROUTE } from "../../apps/dorm/src/building";
import { ITEMS } from "../../apps/dorm/src/items";
import { company, testDb, user, type TestUser } from "../support/db";

let db: Db;
let a: TestUser;
let b: TestUser;
let klag: TestUser;
const call = (u: TestUser, method: string, params: object = {}) => executeCall({ db }, { userId: u.id, slug: "dorm" }, method, params);
type Rec = { id: string; data: Record<string, unknown> };

beforeAll(async () => {
  db = await testDb();
  const A = await company(db, "א");
  a = await user(db, "חניך א", { companyId: A });
  b = await user(db, "חניך ב", { companyId: A });
  klag = await user(db, "קלג", { companyId: A });
  await db.query("insert into public.app_managers (app_slug, profile_id) values ('dorm', $1)", [klag.id]);
  // a and b share room 241.
  await db.query("update public.profiles set room = '241' where id = any($1::uuid[])", [[a.id, b.id]]);
});

describe("dorm app rules", () => {
  it("building.ts and items.ts match the app.json enums", () => {
    const t = manifest.collections.tickets.schema.properties;
    expect(new Set(t.room.enum)).toEqual(new Set(AREAS.map((x) => x.id)));
    expect(new Set(t.item.enum)).toEqual(new Set(ITEMS.map((x) => x.id)));
    expect(new Set(manifest.collections.checks.schema.properties.room.enum)).toEqual(new Set(ROOMS.map((x) => x.id)));
    expect(new Set(manifest.collections.notes.schema.properties.room.enum)).toEqual(new Set(ROOMS.map((x) => x.id)));
    expect(new Set(manifest.collections.area_notes.schema.properties.room.enum)).toEqual(new Set(AREAS.filter((x) => x.kind !== "room").map((x) => x.id)));
    expect(new Set(manifest.collections.tickets.schema.allOf[0].if.properties.item.enum)).toEqual(
      new Set(ITEMS.filter((i) => i.needsNote).map((i) => i.id)),
    );
    expect(ROOMS).toHaveLength(60);
    expect(new Set(ROUTE).size).toBe(AREAS.length);
  });

  it("one open request per room + item; others add +1", async () => {
    const t = (await call(a, "data.add", { collection: "tickets", data: { room: "241", item: "toilet_paper", status: "open", slot: "open" } })) as Rec;
    await expect(
      call(b, "data.add", { collection: "tickets", data: { room: "241", item: "toilet_paper", status: "open", slot: "open" } }),
    ).rejects.toMatchObject({ code: "conflict" });
    await call(b, "data.add", { collection: "plus", data: { ticket: t.id, by: b.id } });
    await expect(call(b, "data.add", { collection: "plus", data: { ticket: t.id, by: b.id } })).rejects.toMatchObject({ code: "conflict" });
    // Other rooms / items are independent.
    await call(b, "data.add", { collection: "tickets", data: { room: "243", item: "toilet_paper", status: "open", slot: "open" } });
  });

  it("only the logistics officer closes other people's requests; then the room can report again", async () => {
    const [t] = (await call(a, "data.list", { collection: "tickets", options: { where: { room: "241", item: "toilet_paper", slot: "open" } } })) as Rec[];
    await expect(call(b, "data.update", { collection: "tickets", id: t.id, patch: { status: "closed", slot: t.id } })).rejects.toMatchObject({ code: "forbidden" });
    await call(klag, "data.update", { collection: "tickets", id: t.id, patch: { status: "closed", slot: t.id, reply: "חולק ✓" } });
    await expect(
      call(b, "data.add", { collection: "tickets", data: { room: "241", item: "toilet_paper", status: "open", slot: "open" } }),
    ).resolves.toBeTruthy();
    await expect(call(klag, "user.me")).resolves.toMatchObject({ manager: true });
    await expect(call(a, "user.me")).resolves.toMatchObject({ manager: false });
  });

  it("validates rooms, items and the note of 'other'", async () => {
    const bad = (data: object) => call(a, "data.add", { collection: "tickets", data: { status: "open", slot: "open", ...data } });
    await expect(bad({ room: "257", item: "lamp" })).rejects.toMatchObject({ code: "invalid" });
    await expect(bad({ room: "241", item: "pizza" })).rejects.toMatchObject({ code: "invalid" });
    await expect(bad({ room: "241", item: "other", slot: crypto.randomUUID() })).rejects.toMatchObject({ code: "invalid" });
    await expect(bad({ room: "3-wc1", item: "other", slot: crypto.randomUUID(), note: "ברז דולף" })).resolves.toBeTruthy();
    // Free text for missing things too.
    await expect(bad({ room: "241", item: "other_missing", slot: crypto.randomUUID() })).rejects.toMatchObject({ code: "invalid" });
    await expect(bad({ room: "241", item: "other_missing", slot: crypto.randomUUID(), note: "סבון ידיים" })).resolves.toBeTruthy();
  });

  it("daily confirmation: once per room, today only", async () => {
    const today = israelToday();
    await call(a, "data.add", { collection: "checks", data: { room: "241", day: today } });
    await expect(call(b, "data.add", { collection: "checks", data: { room: "241", day: today } })).rejects.toMatchObject({ code: "conflict" });
    await expect(call(b, "data.add", { collection: "checks", data: { room: "241", day: "2020-01-01" } })).rejects.toMatchObject({ code: "invalid" });
    await expect(call(b, "data.add", { collection: "checks", data: { room: "2-lobby", day: today } })).rejects.toMatchObject({ code: "invalid" });
  });

  it("inspection notes: the room's members and the logistics officer edit, others can't", async () => {
    await call(a, "data.add", { collection: "notes", data: { room: "241", text: "אבק על הארונות" } });
    await call(b, "data.add", { collection: "notes", data: { room: "241", text: "אבק על הארונות\nפח מלא" } });
    await call(klag, "data.add", { collection: "notes", data: { room: "241", text: "תוקן ✓" } });
    await expect(call(a, "data.add", { collection: "notes", data: { room: "243", text: "x" } })).rejects.toMatchObject({ code: "forbidden" });
    const list = (await call(klag, "data.list", { collection: "notes", options: { where: { room: "241" }, order: "createdAt:desc" } })) as Rec[];
    expect(list.map((n) => n.data.text)).toEqual(["תוקן ✓", "אבק על הארונות\nפח מלא", "אבק על הארונות"]);
    // A user without a room can't write notes or confirm.
    const c = await user(db, "חניך ג");
    await expect(call(c, "data.add", { collection: "notes", data: { room: "241", text: "x" } })).rejects.toMatchObject({ code: "forbidden" });
    await expect(call(c, "data.add", { collection: "checks", data: { room: "243", day: israelToday() } })).rejects.toMatchObject({ code: "forbidden" });
    // The officer confirms any room.
    await expect(call(klag, "data.add", { collection: "checks", data: { room: "243", day: israelToday() } })).resolves.toBeTruthy();
  });

  it("a report from one roommate is visible to the whole room and to the logistics officer", async () => {
    const t = (await call(a, "data.add", { collection: "tickets", data: { room: "241", item: "building", status: "open", slot: crypto.randomUUID(), note: "חור בקיר ליד הדלת" } })) as Rec;
    for (const viewer of [b, klag]) {
      const list = (await call(viewer, "data.list", { collection: "tickets", options: { where: { room: "241", status: "open" } } })) as Rec[];
      expect(list.map((r) => r.id), viewer.name).toContain(t.id);
    }
    await call(a, "data.add", { collection: "notes", data: { room: "241", text: "מסדר: אבק על המדפים" } });
    const notes = (await call(b, "data.list", { collection: "notes", options: { where: { room: "241" }, order: "createdAt:desc", limit: 1 } })) as Rec[];
    expect(notes[0].data.text).toBe("מסדר: אבק על המדפים");
  });

  it("toilets / lobby: anyone opens requests and writes the morning-inspection summary", async () => {
    const outsider = await user(db, "חניך בלי חדר", { companyId: (await db.query<{ company_id: string }>("select company_id from public.profiles where id = $1", [a.id])).rows[0].company_id });
    await expect(call(outsider, "data.add", { collection: "tickets", data: { room: "2-wc1", item: "toilet_paper", status: "open", slot: "open" } })).resolves.toBeTruthy();
    await expect(call(outsider, "data.add", { collection: "area_notes", data: { room: "2-wc1", text: "כיור 2 סתום" } })).resolves.toBeTruthy();
    await expect(call(a, "data.add", { collection: "area_notes", data: { room: "2-wc1", text: "כיור 2 נפתח ✓" } })).resolves.toBeTruthy();
    const list = (await call(klag, "data.list", { collection: "area_notes", options: { where: { room: "2-wc1" }, order: "createdAt:desc" } })) as Rec[];
    expect(list.map((r) => r.data.text)).toEqual(["כיור 2 נפתח ✓", "כיור 2 סתום"]);
    // area notes are only for shared areas
    await expect(call(a, "data.add", { collection: "area_notes", data: { room: "241", text: "x" } })).rejects.toMatchObject({ code: "invalid" });
  });
});
