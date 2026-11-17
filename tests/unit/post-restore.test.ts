// supabase/post-restore.sql must be idempotent and leave the same security state as the migration.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { testDb } from "../support/db";

describe("post-restore.sql", () => {
  it("runs twice on a migrated database without errors and keeps browsers locked out", async () => {
    const db = await testDb();
    const sql = readFileSync("supabase/post-restore.sql", "utf8");
    await db.exec(sql);
    await db.exec(sql);
    await expect(
      db.tx(async (t) => {
        await t.exec("set local role authenticated");
        await t.query("select * from public.app_records");
      }),
    ).rejects.toThrow(/permission denied/);
    // trigger still creates profiles
    const { rows } = await db.query<{ id: string }>("insert into auth.users (email) values ('r@example.com') returning id");
    const p = await db.query("select 1 from public.profiles where id = $1", [rows[0].id]);
    expect(p.rows.length).toBe(1);
    await db.close();
  });
});
