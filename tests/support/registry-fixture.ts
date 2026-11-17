// Fixture registry used by the unit tests in place of src/generated/registry.ts.
import { effectiveScopes, manifestSchema, type ManifestInput, type RegistryApp } from "@/platform/manifest";

const READ = { o: "own", p: "platoon", c: "company", a: "all" } as const;
const MOD = { n: "none", c: "commander", a: "admin" } as const;
const CREATE = { y: "any", c: "commander", a: "admin" } as const;

/** Every combination of read × moderate × create, named r<read>_m<moderate>_c<create>. */
export const MATRIX: { name: string; read: string; moderate: string; create: string }[] = [];
const matrixCollections: Record<string, { read: string; moderate: string; create: string }> = {};
for (const [rk, read] of Object.entries(READ))
  for (const [mk, moderate] of Object.entries(MOD))
    for (const [ck, create] of Object.entries(CREATE)) {
      const name = `r${rk}_m${mk}_c${ck}`;
      MATRIX.push({ name, read, moderate, create });
      matrixCollections[name] = { read, moderate, create };
    }

function app(m: Partial<ManifestInput> & { slug: string }): RegistryApp {
  const parsed = manifestSchema.parse({
    name: m.slug,
    description: "test app",
    tier: "simple",
    icon: "icon.svg",
    tags: ["כלים"],
    authors: ["tester"],
    status: "live",
    version: "1.0.0",
    ...m,
  });
  return { ...parsed, effectiveScopes: effectiveScopes(parsed), iconUrl: `/app-icons/${parsed.slug}.svg` };
}

export const REGISTRY: RegistryApp[] = [
  app({ slug: "matrix", scopes: ["role", "unit"], collections: matrixCollections as ManifestInput["collections"] }),
  app({
    slug: "full-scopes",
    scopes: ["role", "unit", "contact", "push"],
    collections: {
      notes: { read: "own", create: "any", maxPerUser: 3 },
      typed: {
        read: "all",
        create: "any",
        schema: {
          type: "object",
          required: ["title"],
          properties: { title: { type: "string", maxLength: 10 }, n: { type: "integer" } },
          additionalProperties: false,
        },
      },
    },
  }),
  app({ slug: "bare", collections: {} }),
  app({ slug: "pushy", scopes: ["push"] }),
  app({ slug: "hidden-app", status: "hidden", collections: { c: { read: "all", create: "any" } } }),
  app({ slug: "cmd-only", audience: ["commander", "admin"] }),
  app({ slug: "other", collections: { notes: { read: "all", create: "any" } } }),
  app({
    slug: "booking",
    collections: {
      slots: {
        read: "all",
        create: "any",
        moderate: "commander",
        unique: ["machine", "day", "time"],
        quota: [
          { max: 2, period: "week", dateField: "day", match: { kind: "washer" } },
          { max: 2, period: "week", dateField: "day", match: { kind: "dryer" } },
        ],
      },
      windowed: { read: "all", create: "any", window: { dateField: "day", maxDaysAhead: 28 } },
    },
  }),
  app({ slug: "dir-app", scopes: ["directory"] }),
];

export const TAGS = ["כלים", "לומדות"];
