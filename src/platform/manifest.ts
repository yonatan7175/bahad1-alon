// The app.json manifest schema. Used by scripts/build-registry.ts (build time),
// the server (runtime rules) and the docs (generated JSON Schema).
import { z } from "zod";
import type { Role } from "./types";

export const ROLES = ["cadet", "commander", "admin"] as const satisfies readonly Role[];
export const SCOPES = ["profile", "role", "unit", "contact", "data", "push", "directory"] as const;
export type Scope = (typeof SCOPES)[number];
/** Scopes that must be explicitly approved by the owner in PR review. */
export const SENSITIVE_SCOPES: readonly Scope[] = ["contact", "push", "directory"];

export const READ_RULES = ["own", "platoon", "company", "all"] as const;
export const CREATE_RULES = ["any", "commander", "admin"] as const;
export const MODERATE_RULES = ["none", "commander", "admin"] as const;
export type ReadRule = (typeof READ_RULES)[number];
export type CreateRule = (typeof CREATE_RULES)[number];
export type ModerateRule = (typeof MODERATE_RULES)[number];

/** Hard platform cap on records per user per collection. */
export const MAX_RECORDS_PER_USER = 1000;

export const SLUG_RE = /^[a-z0-9-]{3,32}$/;
export const COLLECTION_RE = /^[a-z][a-z0-9_]{0,31}$/;
const GITHUB_USER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const ICON_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(svg|png)$/;

function unique<T>(arr: readonly T[]) {
  return new Set(arr).size === arr.length;
}

export const collectionRuleSchema = z.strictObject({
  read: z.enum(READ_RULES).describe("Which records a regular user sees (besides their own)"),
  create: z.enum(CREATE_RULES).describe("Who can add records"),
  moderate: z
    .enum(MODERATE_RULES)
    .default("admin")
    .describe("Role that can read all records and update/delete any record (commander: own company only)"),
  maxPerUser: z
    .number()
    .int()
    .min(1)
    .max(MAX_RECORDS_PER_USER)
    .optional()
    .describe(`Optional cap on records per user (platform cap ${MAX_RECORDS_PER_USER})`),
  schema: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional JSON Schema; every write is validated against it"),
  unique: z
    .array(z.string().min(1).max(64))
    .min(1)
    .max(5)
    .refine(unique, "unique keys must be unique")
    .optional()
    .describe("Top-level keys whose combined values must be unique in the collection (e.g. a booked slot). Enforced atomically."),
  quota: z
    .array(
      z.strictObject({
        max: z.number().int().min(1).max(MAX_RECORDS_PER_USER),
        period: z.enum(["day", "week"]).describe("week = Sunday–Saturday"),
        dateField: z.string().min(1).max(64).describe('Top-level key holding a "YYYY-MM-DD" date; the period is the one containing it'),
        match: z
          .record(z.string().min(1).max(64), z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .optional()
          .describe("Only records containing these top-level values count (e.g. {\"kind\":\"washer\"})"),
      }),
    )
    .min(1)
    .max(5)
    .optional()
    .describe("Per-user limits per day/week, counted by a date inside the record (e.g. 2 bookings per week)"),
  window: z
    .strictObject({
      dateField: z.string().min(1).max(64),
      maxDaysAhead: z.number().int().min(0).max(366),
      allowPast: z.boolean().default(false),
    })
    .optional()
    .describe('Records must be dated (Israel time) between today and today + maxDaysAhead (past allowed only with allowPast)'),
  ownRoom: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('Top-level key that must equal the writer\'s own room (profile) on every add/update — unless they moderate the collection. Needs scope "unit"'),
});

export const manifestSchema = z
  .strictObject({
    slug: z.string().regex(SLUG_RE, "slug: a-z, 0-9 and '-' only, 3–32 chars"),
    name: z.string().trim().min(1).max(30),
    description: z.string().trim().min(1).max(120),
    tier: z.enum(["simple", "full", "external"]),
    url: z
      .string()
      .url()
      .regex(/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s]*)?$/i, "url: an https:// address")
      .optional()
      .describe('Only for tier "external": the outside site shown inside the portal (owner-approved)'),
    icon: z.string().regex(ICON_RE, "icon: a .svg or .png file name inside the app folder"),
    tags: z
      .array(z.string().min(1))
      .min(1)
      .max(3)
      .refine(unique, "tags must be unique"),
    authors: z
      .array(z.string().regex(GITHUB_USER_RE, "authors: GitHub usernames"))
      .min(1)
      .refine(unique, "authors must be unique"),
    status: z.enum(["live", "beta", "hidden"]),
    audience: z
      .array(z.enum(ROLES))
      .min(1)
      .refine(unique, "audience must be unique")
      .default([...ROLES]),
    scopes: z
      .array(z.enum(SCOPES))
      .refine(unique, "scopes must be unique")
      .default(["profile"]),
    collections: z
      .record(z.string().regex(COLLECTION_RE, "collection names: a-z, 0-9, _ (start with a letter)"), collectionRuleSchema)
      .default({}),
    version: z.string().regex(SEMVER_RE, "version must be semver, e.g. 1.0.0"),
  })
  .superRefine((m, ctx) => {
    if (m.tier === "external") {
      if (!m.url) ctx.addIssue({ code: "custom", path: ["url"], message: 'tier "external" needs a "url"' });
      if (m.scopes.some((s) => s !== "profile") || Object.keys(m.collections).length > 0) {
        ctx.addIssue({ code: "custom", path: ["scopes"], message: "external apps get no Platform API access: no scopes or collections" });
      }
    } else if (m.url) {
      ctx.addIssue({ code: "custom", path: ["url"], message: 'only tier "external" may have a "url"' });
    }
    for (const [name, c] of Object.entries(m.collections)) {
      if (c.ownRoom && !m.scopes.includes("unit")) {
        ctx.addIssue({ code: "custom", path: ["collections", name, "ownRoom"], message: '"ownRoom" needs scope "unit"' });
      }
    }
    if (m.scopes.includes("data") && Object.keys(m.collections).length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["scopes"],
        message: 'scope "data" needs at least one entry in "collections"',
      });
    }
  });

export type ManifestInput = z.input<typeof manifestSchema>;
export type Manifest = z.output<typeof manifestSchema>;
export type CollectionRule = z.output<typeof collectionRuleSchema>;

/** The app.json as stored in the generated registry (normalized + derived fields). */
export interface RegistryApp extends Manifest {
  /** Effective scopes: always includes "profile"; includes "data" when collections exist. */
  effectiveScopes: Scope[];
  /** Public URL of the icon. */
  iconUrl: string;
}

export function effectiveScopes(m: Manifest): Scope[] {
  if (m.tier === "external") return []; // an outside site: nothing is shared with it
  const s = new Set<Scope>(m.scopes);
  s.add("profile");
  if (Object.keys(m.collections).length > 0) s.add("data");
  return SCOPES.filter((x) => s.has(x));
}

export const tagsFileSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(20)).min(1).refine(unique, "tags must be unique"),
});

/** JSON Schema of app.json, for the docs and for AI tools. */
export function manifestJsonSchema(): unknown {
  return z.toJSONSchema(manifestSchema, { io: "input", unrepresentable: "any" });
}

