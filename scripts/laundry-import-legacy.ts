// One-off: carry the old shared laundry calendar into the laundry app (see apps/laundry/src/legacy.ts).
//
//   tsx scripts/laundry-import-legacy.ts <calendar.txt> <pglite dir>                  dry run: parse, check, print
//   tsx scripts/laundry-import-legacy.ts <calendar.txt> <pglite dir> --apply [--clear]
//
// --clear deletes ALL laundry bookings + carried-over records first (and their pending reminders).
// The server must be STOPPED (PGlite allows one process). Everything runs in one transaction.
//
// Input format (the calendar export):
//   === שבת 21.11.2026 ===
//   18:00–19:00 | שם | 0541234567 | מכונת כביסה
// Phones: "–" or 10-digit numbers separated by commas. Machine: מכונת כביסה / מייבש / מכונת כביסה + מייבש.
// An end of 00:00 means midnight. Any line with "|" that doesn't parse aborts the import.
import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import { PGlite } from "@electric-sql/pglite";
import { SLOTS } from "../apps/laundry/src/machines";
import { slotIso } from "../apps/laundry/src/time";
import { legacyRange, slotsFor, toMin, type Legacy } from "../apps/laundry/src/legacy";
import manifest from "../apps/laundry/app.json";

const SYSTEM_ID = "0c0ffee0-0000-4000-8000-00000000ca1e";
const SYSTEM_EMAIL = "old-calendar@laundry.invalid";
const SYSTEM_NAME = "היומן הקודם";
const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const MACHINE: Record<string, { id: string; kind: "washer" | "dryer" }[]> = {
  "מכונת כביסה": [{ id: "w1", kind: "washer" }],
  מייבש: [{ id: "d1", kind: "dryer" }],
  "מכונת כביסה + מייבש": [
    { id: "w1", kind: "washer" },
    { id: "d1", kind: "dryer" },
  ],
};

const [file, dir, ...flags] = process.argv.slice(2);
if (!file || !dir) {
  console.error("usage: tsx scripts/laundry-import-legacy.ts <calendar.txt> <pglite dir> [--apply] [--clear]");
  process.exit(2);
}
const apply = flags.includes("--apply");
const clear = flags.includes("--clear");
const fail = (msg: string): never => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

// ── parse ────────────────────────────────────────────────────────────────────
const entries: Legacy[] = [];
let day: string | null = null;
readFileSync(file, "utf8")
  .split(/\r?\n/)
  .forEach((raw, i) => {
    const line = raw.trim();
    const at = `line ${i + 1}: "${line}"`;
    const h = /^===\s*(\S+)\s+(\d{1,2})\.(\d{1,2})\.(\d{4})\s*===$/.exec(line);
    if (h) {
      const [, wd, d, m, y] = h;
      day = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      const real = WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
      if (real !== wd) fail(`${at} — ${day} is יום ${real}, not ${wd}`);
      return;
    }
    if (!line.includes("|")) return; // titles, notes, blank lines
    if (line.startsWith("פורמט")) return;
    const r = /^(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+)$/.exec(line);
    if (!r) fail(`${at} — can't parse`);
    if (!day) fail(`${at} — no date header above`);
    const [, from, toRaw, name, phonesRaw, machineRaw] = r!;
    const to = toRaw === "00:00" ? "24:00" : toRaw;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(from) || !/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(to)) fail(`${at} — bad time`);
    if (toMin(to) <= toMin(from)) fail(`${at} — ends before it starts`);
    const machines = MACHINE[machineRaw.replace(/\(.*?\)/g, "").trim()];
    if (!machines) fail(`${at} — unknown machine "${machineRaw}"`);
    const phones =
      phonesRaw === "–" || phonesRaw === "-"
        ? []
        : phonesRaw.split(",").map((p) => {
            const d = p.replace(/\D/g, "");
            if (!/^0\d{9}$/.test(d)) fail(`${at} — bad phone "${p.trim()}"`);
            return `${d.slice(0, 3)}-${d.slice(3)}`;
          });
    for (const m of machines!) {
      const e: Legacy = { machine: m.id, day: day!, from, to, name };
      if (phones.length) e.phones = phones;
      if (slotsFor(e).length === 0) fail(`${at} — outside the app's hours (${SLOTS[0]}–24:00)`);
      entries.push(e);
    }
  });
if (!entries.length) fail("no bookings found");

// ── check ────────────────────────────────────────────────────────────────────
const ajv = new Ajv({ allErrors: true, strict: false });
const validLegacy = ajv.compile(manifest.collections.legacy.schema);
const validBooking = ajv.compile(manifest.collections.bookings.schema);
for (const e of entries) {
  if (!validLegacy(e)) fail(`schema: ${JSON.stringify(e)} — ${ajv.errorsText(validLegacy.errors)}`);
}
// No two old bookings on the same machine at the same time.
for (let a = 0; a < entries.length; a++) {
  for (let b = a + 1; b < entries.length; b++) {
    const x = entries[a];
    const y = entries[b];
    if (x.machine === y.machine && x.day === y.day && toMin(x.from) < toMin(y.to) && toMin(y.from) < toMin(x.to)) {
      fail(`overlap on ${x.machine} ${x.day}: ${x.name} ${legacyRange(x)} / ${y.name} ${legacyRange(y)}`);
    }
  }
}
// The whole-machine bookings that hold the grid slots.
const blocks = new Map<string, Record<string, unknown>>();
for (const e of entries) {
  for (const time of slotsFor(e)) {
    const kind = e.machine.startsWith("w") ? "washer" : "dryer";
    const b = { machine: e.machine, kind, day: e.day, time, seats: 2, start: slotIso(e.day, time) };
    if (!validBooking(b)) fail(`schema: ${JSON.stringify(b)} — ${ajv.errorsText(validBooking.errors)}`);
    blocks.set(`${e.machine}|${e.day}|${time}`, b);
  }
}

// ── report ───────────────────────────────────────────────────────────────────
const days = [...new Set(entries.map((e) => e.day))].sort();
for (const d of days) {
  console.log(`\n${d} (יום ${WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()]})`);
  for (const m of ["w1", "d1"]) {
    const list = entries.filter((e) => e.day === d && e.machine === m).sort((a, b) => toMin(a.from) - toMin(b.from));
    if (!list.length) continue;
    console.log(`  ${m === "w1" ? "כביסה" : "מייבש"}:`);
    for (const e of list) console.log(`    ${legacyRange(e).padEnd(11)} ${e.name}${e.phones ? `  ${e.phones.join(", ")}` : ""}  → slots ${slotsFor(e).join(" ")}`);
  }
}
console.log(`\n${entries.length} old bookings → ${blocks.size} blocked 40-minute slots`);
if (!apply) {
  console.log("dry run — nothing written (add --apply)");
  process.exit(0);
}

// ── write ────────────────────────────────────────────────────────────────────
async function write() {
  const db = await PGlite.create(dir);
  try {
    await db.transaction(async (t) => {
      if (clear) {
        const q = await t.query<{ data: { reminderId?: string } }>(
          "delete from public.app_records where app_slug = 'laundry' and collection in ('bookings', 'legacy') returning data",
        );
        const p = await t.query("delete from public.push_queue where app_slug = 'laundry' and sent_at is null returning id");
        console.log(`cleared ${q.rows.length} laundry records and ${p.rows.length} pending laundry reminders`);
      }
      // The system profile that owns the carried-over records. Can never sign in (banned + blocked).
      await t.query(
        `insert into auth.users (id, email, raw_user_meta_data, banned_until) values ($1, $2, $3::jsonb, 'infinity')
         on conflict (id) do nothing`,
        [SYSTEM_ID, SYSTEM_EMAIL, JSON.stringify({ full_name: SYSTEM_NAME })],
      );
      await t.query(
        `insert into public.profiles (id, email, full_name, status) values ($1, $2, $3, 'blocked')
         on conflict (id) do update set full_name = excluded.full_name, status = 'blocked'`,
        [SYSTEM_ID, SYSTEM_EMAIL, SYSTEM_NAME],
      );
      // Nothing may already sit in a slot we block.
      for (const [k, b] of blocks) {
        const r = await t.query("select 1 from public.app_records where app_slug = 'laundry' and collection = 'bookings' and data @> $1::jsonb", [
          JSON.stringify({ machine: b.machine, day: b.day, time: b.time }),
        ]);
        if (r.rows.length) throw new Error(`slot ${k} already has a booking — run with --clear or free it first`);
      }
      for (const e of entries) {
        await t.query("insert into public.app_records (app_slug, collection, owner_id, data) values ('laundry', 'legacy', $1, $2::jsonb)", [SYSTEM_ID, JSON.stringify(e)]);
      }
      for (const b of blocks.values()) {
        await t.query("insert into public.app_records (app_slug, collection, owner_id, data) values ('laundry', 'bookings', $1, $2::jsonb)", [SYSTEM_ID, JSON.stringify(b)]);
      }
      await t.query("insert into public.audit_log (actor_id, action, target, details) values (null, 'laundry.import_legacy', 'laundry', $1::jsonb)", [
        JSON.stringify({ file, entries: entries.length, slots: blocks.size, cleared: clear }),
      ]);
      // Post-check: no slot holds more than 2 seats.
      const over = await t.query(
        `select data->>'machine' m, data->>'day' d, data->>'time' t, sum(coalesce((data->>'seats')::int, 2)) n
           from public.app_records where app_slug = 'laundry' and collection = 'bookings' group by 1, 2, 3 having sum(coalesce((data->>'seats')::int, 2)) > 2`,
      );
      if (over.rows.length) throw new Error(`over capacity: ${JSON.stringify(over.rows)}`);
    });
    const n = await db.query<{ c: string; n: number }>(
      "select collection c, count(*)::int n from public.app_records where app_slug = 'laundry' group by 1 order by 1",
    );
    console.log("✔ imported. laundry records now:", n.rows.map((r) => `${r.c}=${r.n}`).join(", "));
  } finally {
    await db.close();
  }
}
write().catch((e) => fail(String(e instanceof Error ? e.message : e)));
