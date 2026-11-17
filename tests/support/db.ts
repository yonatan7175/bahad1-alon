import { createDb, type Db } from "@/platform/server/db-core";
import type { Role } from "@/platform/types";

export async function testDb(): Promise<Db> {
  return createDb({ kind: "pglite" }); // in-memory, shim + migrations applied
}

export async function company(db: Db, name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>("insert into public.companies (name) values ($1) returning id", [name]);
  return rows[0].id;
}

export async function platoon(db: Db, companyId: string, name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.platoons (company_id, name) values ($1, $2) returning id",
    [companyId, name],
  );
  return rows[0].id;
}

export interface TestUser {
  id: string;
  role: Role;
  companyId: string | null;
  platoonId: string | null;
  name: string;
}

export async function user(
  db: Db,
  name: string,
  opts: { role?: Role; status?: "pending" | "approved" | "blocked"; companyId?: string | null; platoonId?: string | null; phone?: string } = {},
): Promise<TestUser> {
  const email = `${name.replace(/\W/g, "").toLowerCase() || "u"}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id",
    [email, JSON.stringify({ full_name: name, avatar_url: "https://example.com/a.png" })],
  );
  const id = rows[0].id;
  await db.query(
    `update public.profiles set role = $2, status = $3, company_id = $4, platoon_id = $5, phone = $6, full_name = $7
      where id = $1`,
    [id, opts.role ?? "cadet", opts.status ?? "approved", opts.companyId ?? null, opts.platoonId ?? null, opts.phone ?? null, name],
  );
  return { id, role: opts.role ?? "cadet", companyId: opts.companyId ?? null, platoonId: opts.platoonId ?? null, name };
}

/** Inserts a record directly (bypassing the API) — for setting up read/write matrices. */
export async function rawRecord(db: Db, slug: string, collection: string, ownerId: string, data: object = {}): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.app_records (app_slug, collection, owner_id, data) values ($1, $2, $3, $4::jsonb) returning id",
    [slug, collection, ownerId, JSON.stringify(data)],
  );
  return rows[0].id;
}
