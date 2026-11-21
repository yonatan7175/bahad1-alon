// The Platform API engine: every bahad.* call (from simple apps via the host
// page, from full apps via fetch or platformFor) ends up in executeCall().
// It re-checks EVERYTHING on every call (plan section 05 — Rules of the implementation).
import { z } from "zod";
import { Ajv, type ValidateFunction } from "ajv";
import { BahadError } from "../errors";
import { MAX_RECORDS_PER_USER, type CollectionRule, type RegistryApp, type Scope } from "../manifest";
import type { BahadRecord, JsonObject, Me, NotifyResult, Role } from "../types";
import type { Db } from "./db-core";
import { canUseApp, effectiveStatus, getApp, loadOverride } from "./registry";
import { canCreate, canRead, canWrite, moderationScope, readVisibilitySql, type Actor } from "./rules";
import { getPerson } from "./directory";

import { LIMITS } from "../limits";
export { LIMITS };

export type Publish = (slug: string, collection: string) => void | Promise<void>;

export interface EngineDeps {
  db: Db;
  /** "collection changed" signal (realtime). Errors are swallowed. */
  publish?: Publish;
  /** Called when push rows became due immediately (so they can be sent right away). */
  onPushDue?: () => void;
}

export interface CallContext {
  /** Authenticated user id (from the session), or null. */
  userId: string | null;
  /** App identity — ALWAYS from the host (iframe route / platformFor binding), never from the app. */
  slug: string;
}

export const METHODS = [
  "user.me",
  "data.add",
  "data.list",
  "data.get",
  "data.update",
  "data.remove",
  "data.access",
  "push.notify",
  "push.cancel",
  "people.get",
] as const;
export type Method = (typeof METHODS)[number];

// ── context ──────────────────────────────────────────────────────────────────

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  room: string | null;
  role: Role;
  status: "pending" | "approved" | "blocked";
  company_id: string | null;
  company_name: string | null;
  platoon_id: string | null;
  platoon_name: string | null;
  last_seen_at: Date | null;
  onboarded_at: Date | null;
  show_phone: boolean;
  show_email: boolean;
}

export type { ProfileRow };

export interface Ctx {
  db: Db;
  actor: Actor;
  profile: ProfileRow;
  app: RegistryApp;
}

export async function loadProfile(db: Db, userId: string): Promise<ProfileRow | null> {
  const { rows } = await db.query<ProfileRow>(
    `select p.id, p.email, p.full_name, p.avatar_url, p.phone, p.room, p.role, p.status,
            p.company_id, c.name as company_name, p.platoon_id, pl.name as platoon_name, p.last_seen_at, p.onboarded_at, p.show_phone, p.show_email
       from public.profiles p
       left join public.companies c on c.id = p.company_id
       left join public.platoons pl on pl.id = p.platoon_id
      where p.id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

async function loadCtx(db: Db, c: CallContext): Promise<Ctx> {
  if (!c.userId) throw new BahadError("unauthorized", "not signed in");
  const profile = await loadProfile(db, c.userId);
  if (!profile) throw new BahadError("unauthorized", "no profile");
  if (profile.status !== "approved") throw new BahadError("forbidden", "user is not approved");
  const app = getApp(c.slug);
  if (!app) throw new BahadError("not_found", "unknown app");
  const status = effectiveStatus(app, await loadOverride(db, app.slug));
  if (status === "disabled") throw new BahadError("app_disabled", "this app is disabled by an admin");
  if (!canUseApp(app, status, profile.role)) throw new BahadError("forbidden", "this app is not available to you");
  if (!profile.last_seen_at || Date.now() - new Date(profile.last_seen_at).getTime() > 3600_000) {
    await db.query("update public.profiles set last_seen_at = now() where id = $1", [profile.id]);
  }
  const { rows: mgr } = await db.query("select 1 from public.app_managers where app_slug = $1 and profile_id = $2", [app.slug, profile.id]);
  return {
    db,
    profile,
    app,
    actor: { id: profile.id, role: profile.role, companyId: profile.company_id, platoonId: profile.platoon_id, appManager: mgr.length > 0 },
  };
}

function requireScope(ctx: Ctx, scope: Scope) {
  if (!ctx.app.effectiveScopes.includes(scope)) {
    throw new BahadError("forbidden", `app.json does not declare scope "${scope}"`);
  }
}

function getRule(ctx: Ctx, collection: unknown): { name: string; rule: CollectionRule } {
  requireScope(ctx, "data");
  if (typeof collection !== "string") throw new BahadError("invalid", "collection name must be a string");
  const rule = Object.hasOwn(ctx.app.collections, collection) ? ctx.app.collections[collection] : undefined;
  if (!rule) throw new BahadError("not_found", `collection "${collection}" is not declared in app.json`);
  return { name: collection, rule };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issue = r.error.issues[0];
    const where = issue?.path?.length ? ` (${issue.path.join(".")})` : "";
    throw new BahadError("invalid", `${what}: ${issue?.message ?? "invalid"}${where}`);
  }
  return r.data;
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parseId(v: unknown): string {
  if (typeof v !== "string" || !uuidRe.test(v)) throw new BahadError("not_found", "record not found");
  return v.toLowerCase();
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Normalizes to pure JSON and enforces the 16 KB limit. */
function toJsonObject(v: unknown, what: string): JsonObject {
  if (!isPlainObject(v)) throw new BahadError("invalid", `${what} must be a plain object`);
  let text: string;
  try {
    text = JSON.stringify(v);
  } catch {
    throw new BahadError("invalid", `${what} is not JSON-serializable`);
  }
  if (Buffer.byteLength(text, "utf8") > LIMITS.recordBytes) {
    throw new BahadError("invalid", `record is larger than ${LIMITS.recordBytes / 1024} KB`);
  }
  const parsed = JSON.parse(text) as JsonObject;
  // Postgres jsonb rejects \u0000 in strings.
  if (hasNul(parsed)) throw new BahadError("invalid", "strings may not contain NUL characters");
  return parsed;
}

function hasNul(v: unknown): boolean {
  if (typeof v === "string") return v.includes("\u0000");
  if (Array.isArray(v)) return v.some(hasNul);
  if (v && typeof v === "object") return Object.entries(v).some(([k, x]) => k.includes("\u0000") || hasNul(x));
  return false;
}

const ajv = new Ajv({ allErrors: false, strict: false });
const validators = new Map<string, ValidateFunction>();
function validateSchema(ctx: Ctx, name: string, rule: CollectionRule, data: JsonObject) {
  if (!rule.schema) return;
  const key = `${ctx.app.slug}/${ctx.app.version}/${name}`;
  let v = validators.get(key);
  if (!v) {
    v = ajv.compile(rule.schema);
    validators.set(key, v);
  }
  if (!v(data)) {
    const e = v.errors?.[0];
    throw new BahadError("invalid", `data does not match the schema: ${e?.instancePath || "/"} ${e?.message ?? ""}`.trim());
  }
}

/** Fixed-window counter; throws rate_limited when over the limit. */
export async function hit(db: Db, key: string, window: "minute" | "day", limit: number, message: string) {
  const { rows } = await db.query<{ count: number }>(
    `insert into public.rate_counters (key, window_start, count)
     values ($1, date_trunc('${window}', now()), 1)
     on conflict (key, window_start) do update set count = public.rate_counters.count + 1
     returning count`,
    [key],
  );
  if ((rows[0]?.count ?? 0) > limit) throw new BahadError("rate_limited", message);
}

interface RecordRow {
  id: string;
  data: JsonObject;
  owner_id: string;
  owner_name: string | null;
  owner_company_id: string | null;
  owner_platoon_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const RECORD_COLS = `r.id, r.data, r.owner_id, o.full_name as owner_name,
  o.company_id as owner_company_id, o.platoon_id as owner_platoon_id, r.created_at, r.updated_at`;

function toRecord(row: RecordRow, actor: Actor): BahadRecord {
  return {
    id: row.id,
    data: row.data,
    owner: { id: row.owner_id, name: row.owner_name ?? "ללא שם" },
    mine: row.owner_id === actor.id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const ownerInfo = (row: RecordRow) => ({
  ownerId: row.owner_id,
  ownerCompanyId: row.owner_company_id,
  ownerPlatoonId: row.owner_platoon_id,
});

async function fetchRecord(db: Db, ctx: Ctx, collection: string, id: string, lock = false): Promise<RecordRow | null> {
  const { rows } = await db.query<RecordRow>(
    `select ${RECORD_COLS}
       from public.app_records r join public.profiles o on o.id = r.owner_id
      where r.id = $1 and r.app_slug = $2 and r.collection = $3
      ${lock ? "for update of r" : ""}`,
    [id, ctx.app.slug, collection],
  );
  return rows[0] ?? null;
}

async function signal(deps: EngineDeps, slug: string, collection: string) {
  try {
    await deps.publish?.(slug, collection);
  } catch (e) {
    console.error("[platform] publish failed", e);
  }
}

// ── methods ──────────────────────────────────────────────────────────────────

function me(ctx: Ctx): Me {
  const p = ctx.profile;
  const out: Me = { id: p.id, name: p.full_name ?? "ללא שם", avatarUrl: p.avatar_url };
  const s = ctx.app.effectiveScopes;
  if (s.includes("role")) {
    out.role = p.role;
    out.manager = ctx.actor.role === "admin" || !!ctx.actor.appManager;
  }
  if (s.includes("unit")) {
    out.room = p.room;
    out.company = p.company_id ? { id: p.company_id, name: p.company_name ?? "" } : null;
    out.platoon = p.platoon_id ? { id: p.platoon_id, name: p.platoon_name ?? "" } : null;
  }
  if (s.includes("contact")) {
    out.email = p.email;
    out.phone = p.phone;
  }
  return out;
}

const scalar = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);
const listOptionsSchema = z
  .strictObject({
    where: z
      .record(z.string().min(1).max(64), scalar)
      .refine((w) => Object.keys(w).length <= LIMITS.whereKeys, `where: at most ${LIMITS.whereKeys} keys`)
      .optional(),
    order: z.enum(["createdAt:desc", "createdAt:asc", "updatedAt:desc", "updatedAt:asc"]).optional(),
    limit: z.number().int().min(1).max(LIMITS.listMax).optional(),
    mine: z.boolean().optional(),
  })
  .optional();

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
function periodRange(day: string, period: "day" | "week"): [string, string] {
  if (period === "day") return [day, day];
  const [y, m, d] = day.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const start = t - new Date(t).getUTCDay() * 86400_000; // Sunday
  const iso = (x: number) => new Date(x).toISOString().slice(0, 10);
  return [iso(start), iso(start + 6 * 86400_000)];
}

const isScalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);

/**
 * Collection constraints that need the database: `unique` (no two records share these values),
 * `capacity` (a group of key values holds up to N seats)
 * and `quota` (per-user limits per day/week, by a date inside the record). Runs inside the
 * write transaction, under advisory locks, so concurrent writes can't slip past them.
 */
/** Today's date in Israel ("YYYY-MM-DD"). The portal's calendar day. */
export function israelToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
const addDays = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

function enforceWindow(rule: CollectionRule, data: JsonObject) {
  const w = rule.window;
  if (!w) return;
  const day = data[w.dateField];
  if (typeof day !== "string" || !DAY_RE.test(day) || Number.isNaN(Date.parse(day))) {
    throw new BahadError("invalid", `"${w.dateField}" must be a date "YYYY-MM-DD"`);
  }
  const today = israelToday();
  if (!w.allowPast && day < today) throw new BahadError("invalid", "this date is in the past");
  if (day > addDays(today, w.maxDaysAhead)) throw new BahadError("invalid", `too far ahead (at most ${w.maxDaysAhead} days)`);
}

/** rule.ownRoom: the record must be about the writer's own room (moderators: any room). */
function enforceOwnRoom(ctx: Ctx, rule: CollectionRule, data: JsonObject) {
  if (!rule.ownRoom || moderationScope(ctx.actor, rule) === "all") return;
  if (!ctx.profile.room || data[rule.ownRoom] !== ctx.profile.room) {
    throw new BahadError("forbidden", `"${rule.ownRoom}" must be your own room`);
  }
}

async function enforceConstraints(t: Db, ctx: Ctx, name: string, rule: CollectionRule, data: JsonObject, ownerId: string, excludeId: string | null) {
  enforceWindow(rule, data);
  if (rule.unique) {
    const key: Record<string, unknown> = {};
    for (const k of rule.unique) {
      if (!Object.hasOwn(data, k) || !isScalar(data[k])) throw new BahadError("invalid", `"${k}" is required (string, number, boolean or null)`);
      key[k] = data[k];
    }
    await t.query("select pg_advisory_xact_lock(hashtext($1))", [`${ctx.app.slug}/${name}/unique/${JSON.stringify(rule.unique.map((k) => key[k]))}`]);
    const { rows } = await t.query(
      `select 1 from public.app_records
        where app_slug = $1 and collection = $2 and data @> $3::jsonb and ($4::uuid is null or id <> $4::uuid) limit 1`,
      [ctx.app.slug, name, JSON.stringify(key), excludeId],
    );
    if (rows.length) throw new BahadError("conflict", `a record with the same ${rule.unique.join(" + ")} already exists`);
  }
  if (rule.capacity) {
    const c = rule.capacity;
    const key: Record<string, unknown> = {};
    for (const k of c.keys) {
      if (!Object.hasOwn(data, k) || !isScalar(data[k])) throw new BahadError("invalid", `"${k}" is required (string, number, boolean or null)`);
      key[k] = data[k];
    }
    let size = 1;
    if (c.sizeField) {
      const v = data[c.sizeField];
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > c.max) {
        throw new BahadError("invalid", `"${c.sizeField}" must be a whole number from 1 to ${c.max}`);
      }
      size = v;
    }
    await t.query("select pg_advisory_xact_lock(hashtext($1))", [`${ctx.app.slug}/${name}/capacity/${JSON.stringify(c.keys.map((k) => key[k]))}`]);
    // Seats already taken by the other records of this group. A record without a valid size (e.g. written
    // before sizeField existed) counts as taking every seat — the safe reading.
    const seats = c.sizeField
      ? `case when jsonb_typeof(data -> $5) = 'number' and (data ->> $5)::numeric >= 1 and (data ->> $5)::numeric <= $6
              then ceil((data ->> $5)::numeric) else $6 end`
      : "1";
    const { rows } = await t.query<{ n: number }>(
      `select coalesce(sum(${seats}), 0)::int as n from public.app_records
        where app_slug = $1 and collection = $2 and data @> $3::jsonb and ($4::uuid is null or id <> $4::uuid)`,
      c.sizeField
        ? [ctx.app.slug, name, JSON.stringify(key), excludeId, c.sizeField, c.max]
        : [ctx.app.slug, name, JSON.stringify(key), excludeId],
    );
    if ((rows[0]?.n ?? 0) + size > c.max) throw new BahadError("conflict", `not enough room left for the same ${c.keys.join(" + ")} (${c.max} seats)`);
  }
  for (const q of rule.quota ?? []) {
    if (q.match && !Object.entries(q.match).every(([k, v]) => Object.hasOwn(data, k) && data[k] === v)) continue;
    const day = data[q.dateField];
    if (typeof day !== "string" || !DAY_RE.test(day) || Number.isNaN(Date.parse(day))) {
      throw new BahadError("invalid", `"${q.dateField}" must be a date "YYYY-MM-DD"`);
    }
    const [from, to] = periodRange(day, q.period);
    const { rows } = await t.query<{ n: number }>(
      `select count(*)::int as n from public.app_records
        where app_slug = $1 and collection = $2 and owner_id = $3 and data @> $4::jsonb
          and (data ->> $5) between $6 and $7 and ($8::uuid is null or id <> $8::uuid)`,
      [ctx.app.slug, name, ownerId, JSON.stringify(q.match ?? {}), q.dateField, from, to, excludeId],
    );
    if ((rows[0]?.n ?? 0) >= q.max) {
      throw new BahadError("rate_limited", `limit reached: ${q.max} per ${q.period === "week" ? "week (Sunday–Saturday)" : "day"}`);
    }
  }
}

async function dataAdd(deps: EngineDeps, ctx: Ctx, p: Record<string, unknown>) {
  const { name, rule } = getRule(ctx, p.collection);
  if (!canCreate(ctx.actor, rule)) throw new BahadError("forbidden", "you may not add records to this collection");
  const data = toJsonObject(p.data, "data");
  validateSchema(ctx, name, rule, data);
  enforceOwnRoom(ctx, rule, data);
  await hit(ctx.db, `w:${ctx.app.slug}:${ctx.actor.id}`, "minute", LIMITS.writesPerMinute, "too many writes, try again in a minute");
  const max = rule.maxPerUser ?? MAX_RECORDS_PER_USER;
  const row = await ctx.db.tx(async (t) => {
    // Serialize concurrent adds by the same user to the same collection so maxPerUser is exact.
    await t.query("select pg_advisory_xact_lock(hashtext($1))", [`${ctx.app.slug}/${name}/${ctx.actor.id}`]);
    const { rows: c } = await t.query<{ n: number }>(
      "select count(*)::int as n from public.app_records where app_slug = $1 and collection = $2 and owner_id = $3",
      [ctx.app.slug, name, ctx.actor.id],
    );
    if ((c[0]?.n ?? 0) >= max) throw new BahadError("rate_limited", `record limit reached (${max} per user)`);
    await enforceConstraints(t, ctx, name, rule, data, ctx.actor.id, null);
    const { rows } = await t.query<{ id: string }>(
      `insert into public.app_records (app_slug, collection, owner_id, data)
       values ($1, $2, $3, $4::jsonb) returning id`,
      [ctx.app.slug, name, ctx.actor.id, JSON.stringify(data)],
    );
    return fetchRecord(t, ctx, name, rows[0].id);
  });
  await signal(deps, ctx.app.slug, name);
  return toRecord(row!, ctx.actor);
}

async function dataList(ctx: Ctx, p: Record<string, unknown>) {
  const { name, rule } = getRule(ctx, p.collection);
  const opts = parse(listOptionsSchema, p.options ?? undefined, "list options") ?? {};
  const params: unknown[] = [ctx.app.slug, name];
  const conds = ["r.app_slug = $1", "r.collection = $2"];
  if (opts.where && Object.keys(opts.where).length > 0) {
    params.push(JSON.stringify(opts.where));
    conds.push(`r.data @> $${params.length}::jsonb`);
  }
  if (opts.mine) {
    params.push(ctx.actor.id);
    conds.push(`r.owner_id = $${params.length}::uuid`);
  }
  conds.push(readVisibilitySql(ctx.actor, rule, params));
  const [field, dir] = (opts.order ?? "createdAt:desc").split(":");
  const col = field === "updatedAt" ? "r.updated_at" : "r.created_at";
  const order = dir === "asc" ? "asc" : "desc";
  params.push(opts.limit ?? LIMITS.listDefault);
  const { rows } = await ctx.db.query<RecordRow>(
    `select ${RECORD_COLS}
       from public.app_records r join public.profiles o on o.id = r.owner_id
      where ${conds.join(" and ")}
      order by ${col} ${order}, r.id ${order}
      limit $${params.length}`,
    params,
  );
  return rows.map((r) => toRecord(r, ctx.actor));
}

async function dataGet(ctx: Ctx, p: Record<string, unknown>) {
  const { name, rule } = getRule(ctx, p.collection);
  const id = parseId(p.id);
  const row = await fetchRecord(ctx.db, ctx, name, id);
  // Not visible ⇒ not_found (never reveal that the record exists).
  if (!row || !canRead(ctx.actor, rule, ownerInfo(row))) throw new BahadError("not_found", "record not found");
  return toRecord(row, ctx.actor);
}

async function dataUpdate(deps: EngineDeps, ctx: Ctx, p: Record<string, unknown>) {
  const { name, rule } = getRule(ctx, p.collection);
  const id = parseId(p.id);
  const patch = toJsonObject(p.patch, "patch");
  await hit(ctx.db, `w:${ctx.app.slug}:${ctx.actor.id}`, "minute", LIMITS.writesPerMinute, "too many writes, try again in a minute");
  const row = await ctx.db.tx(async (t) => {
    const cur = await fetchRecord(t, ctx, name, id, true);
    if (!cur || !canRead(ctx.actor, rule, ownerInfo(cur))) throw new BahadError("not_found", "record not found");
    if (!canWrite(ctx.actor, rule, ownerInfo(cur))) throw new BahadError("forbidden", "you may not change this record");
    const merged = toJsonObject({ ...cur.data, ...patch }, "data");
    validateSchema(ctx, name, rule, merged);
    enforceOwnRoom(ctx, rule, merged);
    if (rule.unique || rule.capacity || rule.quota || rule.window) {
      await t.query("select pg_advisory_xact_lock(hashtext($1))", [`${ctx.app.slug}/${name}/${cur.owner_id}`]);
      await enforceConstraints(t, ctx, name, rule, merged, cur.owner_id, id);
    }
    await t.query("update public.app_records set data = $2::jsonb where id = $1", [id, JSON.stringify(merged)]);
    return fetchRecord(t, ctx, name, id);
  });
  await signal(deps, ctx.app.slug, name);
  return toRecord(row!, ctx.actor);
}

async function dataRemove(deps: EngineDeps, ctx: Ctx, p: Record<string, unknown>) {
  const { name, rule } = getRule(ctx, p.collection);
  const id = parseId(p.id);
  await hit(ctx.db, `w:${ctx.app.slug}:${ctx.actor.id}`, "minute", LIMITS.writesPerMinute, "too many writes, try again in a minute");
  await ctx.db.tx(async (t) => {
    const cur = await fetchRecord(t, ctx, name, id, true);
    if (!cur || !canRead(ctx.actor, rule, ownerInfo(cur))) throw new BahadError("not_found", "record not found");
    if (!canWrite(ctx.actor, rule, ownerInfo(cur))) throw new BahadError("forbidden", "you may not delete this record");
    await t.query("delete from public.app_records where id = $1", [id]);
  });
  await signal(deps, ctx.app.slug, name);
  return null;
}

const notifySchema = z.strictObject({
  to: z.union([
    z.literal("me"),
    z.strictObject({ platoon: z.string().regex(uuidRe, "platoon id must be a uuid") }),
    z.strictObject({ company: z.string().regex(uuidRe, "company id must be a uuid") }),
  ]),
  title: z.string().trim().min(1).max(LIMITS.pushTitle),
  body: z.string().max(LIMITS.pushBody).optional(),
  at: z.iso.datetime({ offset: true }).optional(),
  url: z.string().max(300).optional(),
});

function checkPushUrl(slug: string, url: string | undefined): string {
  const base = `/a/${slug}`;
  if (url === undefined) return base;
  const ok =
    (url === base || url.startsWith(base + "/") || url.startsWith(base + "?") || url.startsWith(base + "#")) &&
    !url.includes("//") &&
    !url.includes("\\") &&
    !/[\u0000-\u001f]/.test(url);
  if (!ok) throw new BahadError("invalid", `url must be a path inside this app, starting with ${base}`);
  return url;
}

async function pushNotify(deps: EngineDeps, ctx: Ctx, p: Record<string, unknown>): Promise<NotifyResult> {
  requireScope(ctx, "push");
  const o = parse(notifySchema, p.options, "notify options");
  const url = checkPushUrl(ctx.app.slug, o.url);
  const now = Date.now();
  const at = o.at ? new Date(o.at) : new Date(now);
  if (at.getTime() < now - 60_000) throw new BahadError("invalid", "at is in the past");
  if (at.getTime() > now + LIMITS.pushMaxAheadDays * 86400_000) {
    throw new BahadError("invalid", `at is more than ${LIMITS.pushMaxAheadDays} days ahead`);
  }
  const { actor, db } = ctx;
  let recipientSql: string;
  let recipientParams: unknown[];
  if (o.to === "me") {
    recipientSql = "select id from public.profiles where id = $1 and status = 'approved'";
    recipientParams = [actor.id];
  } else {
    if (actor.role !== "commander" && actor.role !== "admin") {
      throw new BahadError("forbidden", "only commanders and admins can notify a unit");
    }
    if ("platoon" in o.to) {
      const { rows } = await db.query<{ company_id: string }>("select company_id from public.platoons where id = $1", [
        o.to.platoon,
      ]);
      if (!rows[0]) throw new BahadError("not_found", "platoon not found");
      if (actor.role === "commander" && rows[0].company_id !== actor.companyId) {
        throw new BahadError("forbidden", "commanders can notify only their own company");
      }
      recipientSql = "select id from public.profiles where platoon_id = $1 and status = 'approved'";
      recipientParams = [o.to.platoon];
    } else {
      const { rows } = await db.query("select 1 from public.companies where id = $1", [o.to.company]);
      if (!rows[0]) throw new BahadError("not_found", "company not found");
      if (actor.role === "commander" && o.to.company !== actor.companyId) {
        throw new BahadError("forbidden", "commanders can notify only their own company");
      }
      recipientSql = "select id from public.profiles where company_id = $1 and status = 'approved'";
      recipientParams = [o.to.company];
    }
  }
  await hit(db, `p:${ctx.app.slug}:${actor.id}`, "day", LIMITS.pushPerDay, `push limit reached (${LIMITS.pushPerDay} per day)`);
  const batchId = crypto.randomUUID();
  const n = recipientParams.length + 1;
  const { rows } = await db.query<{ n: number }>(
    `with ins as (
       insert into public.push_queue (batch_id, app_slug, sender_id, user_id, title, body, url, send_at)
       select $${n}::uuid, $${n + 1}, $${n + 2}::uuid, x.id, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}::timestamptz
         from (${recipientSql}) x
       returning 1)
     select count(*)::int as n from ins`,
    [...recipientParams, batchId, ctx.app.slug, actor.id, o.title, o.body ?? null, url, at.toISOString()],
  );
  if (at.getTime() <= Date.now()) deps.onPushDue?.();
  return { id: batchId, recipients: rows[0]?.n ?? 0 };
}

async function pushCancel(ctx: Ctx, p: Record<string, unknown>) {
  requireScope(ctx, "push");
  const id = typeof p.id === "string" && uuidRe.test(p.id) ? p.id : null;
  if (!id) throw new BahadError("not_found", "notification not found");
  const { rows } = await ctx.db.query<{ n: number }>(
    "select count(*)::int as n from public.push_queue where batch_id = $1 and app_slug = $2 and sender_id = $3",
    [id, ctx.app.slug, ctx.actor.id],
  );
  if (!rows[0]?.n) throw new BahadError("not_found", "notification not found");
  await ctx.db.query(
    "delete from public.push_queue where batch_id = $1 and app_slug = $2 and sender_id = $3 and sent_at is null",
    [id, ctx.app.slug, ctx.actor.id],
  );
  return null;
}

// ── entry point ──────────────────────────────────────────────────────────────

export async function executeCall(deps: EngineDeps, c: CallContext, method: string, params: unknown): Promise<unknown> {
  if (!(METHODS as readonly string[]).includes(method)) throw new BahadError("invalid", `unknown method "${method}"`);
  const p: Record<string, unknown> = isPlainObject(params) ? params : {};
  const ctx = await loadCtx(deps.db, c);
  switch (method as Method) {
    case "user.me":
      return me(ctx);
    case "data.add":
      return dataAdd(deps, ctx, p);
    case "data.list":
      return dataList(ctx, p);
    case "data.get":
      return dataGet(ctx, p);
    case "data.update":
      return dataUpdate(deps, ctx, p);
    case "data.remove":
      return dataRemove(deps, ctx, p);
    case "data.access":
      // Used before subscribing to live signals: may this user read this collection at all?
      getRule(ctx, p.collection);
      return null;
    case "push.notify":
      return pushNotify(deps, ctx, p);
    case "push.cancel":
      return pushCancel(ctx, p);
    case "people.get": {
      requireScope(ctx, "directory");
      const person = typeof p.id === "string" ? await getPerson(ctx.db, p.id) : null;
      if (!person) throw new BahadError("not_found", "user not found");
      return { id: person.id, name: person.name, avatarUrl: person.avatarUrl, role: person.role, company: person.company, platoon: person.platoon, phone: person.phone, email: person.email };
    }
  }
}
