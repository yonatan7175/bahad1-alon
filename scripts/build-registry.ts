// Validates every apps/*/app.json and generates the registry (plan 02 — Build pipeline).
//   1. validate each manifest (zod) — any error fails the build
//   2. tags ∈ apps/tags.json, slug = folder, icon exists, tier/folder consistency, size ≤ 5 MB
//   3. write src/generated/registry.ts
//   4. copy apps/<slug>/site/** → public/apps/<slug>/**, icons → public/app-icons/
//
// BAHAD_EXTRA_APPS_DIR adds another folder of apps (used ONLY by the security
// tests, for the deliberately malicious fixture app). Never set it in production.
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Ajv } from "ajv";
import { effectiveScopes, manifestSchema, tagsFileSchema, type RegistryApp } from "../src/platform/manifest";

const ROOT = path.resolve(__dirname, "..");
export const MAX_APP_BYTES = 5 * 1024 * 1024;

export interface BuildResult {
  apps: RegistryApp[];
  tags: string[];
  errors: string[];
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(p);
    else if (e.isFile()) total += (await stat(p)).size;
  }
  return total;
}

function pngSize(buf: Buffer): { w: number; h: number } | null {
  const sig = "89504e470d0a1a0a";
  if (buf.length < 24 || buf.subarray(0, 8).toString("hex") !== sig) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

export async function collectApps(appDirs: string[], root = ROOT): Promise<BuildResult & { dirs: Map<string, string> }> {
  const errors: string[] = [];
  const tagsRaw = JSON.parse(await readFile(path.join(root, "apps", "tags.json"), "utf8"));
  const tagsParsed = tagsFileSchema.safeParse(tagsRaw);
  if (!tagsParsed.success) {
    return { apps: [], tags: [], errors: [`apps/tags.json: ${tagsParsed.error.issues[0]?.message}`], dirs: new Map() };
  }
  const tags = tagsParsed.data.tags;
  const apps: RegistryApp[] = [];
  const dirs = new Map<string, string>();
  const ajv = new Ajv({ strict: false });

  for (const base of appDirs) {
    if (!existsSync(base)) continue;
    for (const entry of (await readdir(base, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const folder = entry.name;
      const dir = path.join(base, folder);
      const rel = path.relative(root, dir);
      const err = (m: string) => errors.push(`${rel}: ${m}`);
      const manifestPath = path.join(dir, "app.json");
      if (!existsSync(manifestPath)) {
        err("missing app.json");
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(await readFile(manifestPath, "utf8"));
      } catch (e) {
        err(`app.json is not valid JSON (${(e as Error).message})`);
        continue;
      }
      const parsed = manifestSchema.safeParse(json);
      if (!parsed.success) {
        for (const i of parsed.error.issues) err(`app.json ${i.path.join(".") || "(root)"}: ${i.message}`);
        continue;
      }
      const m = parsed.data;
      if (m.slug !== folder) err(`slug "${m.slug}" must equal the folder name "${folder}"`);
      if (dirs.has(m.slug)) err(`slug "${m.slug}" is already used by ${path.relative(root, dirs.get(m.slug)!)}`);
      for (const t of m.tags) if (!tags.includes(t)) err(`unknown tag "${t}" (allowed: ${tags.join(", ")})`);

      const iconPath = path.join(dir, m.icon);
      if (!existsSync(iconPath)) err(`icon "${m.icon}" not found`);
      else {
        const buf = await readFile(iconPath);
        if (m.icon.endsWith(".png")) {
          const s = pngSize(buf);
          if (!s) err(`icon "${m.icon}" is not a valid PNG`);
          else if (s.w < 192 || s.h < 192) err(`icon "${m.icon}" must be at least 192×192 px (is ${s.w}×${s.h})`);
        } else if (!/<svg[\s>]/i.test(buf.toString("utf8"))) err(`icon "${m.icon}" is not an SVG`);
      }

      const siteIndex = path.join(dir, "site", "index.html");
      const fullRoute = path.join(root, "src", "app", "a", m.slug, "page.tsx");
      if (m.tier === "external") {
        if (existsSync(path.join(dir, "site"))) err("external app must not have a site/ folder");
        if (existsSync(fullRoute)) err(`external app must not have ${path.relative(root, fullRoute)}`);
      } else if (m.tier === "simple") {
        if (!existsSync(siteIndex)) err("simple app needs site/index.html");
        if (existsSync(fullRoute)) err(`simple app must not have ${path.relative(root, fullRoute)}`);
      } else {
        if (!existsSync(fullRoute)) err(`full app needs ${path.relative(root, fullRoute)}`);
        if (existsSync(path.join(dir, "site"))) err("full app must not have a site/ folder");
      }

      for (const [name, rule] of Object.entries(m.collections)) {
        if (rule.schema) {
          try {
            ajv.compile(rule.schema);
          } catch (e) {
            err(`collections.${name}.schema is not a valid JSON Schema (${(e as Error).message})`);
          }
        }
      }

      const size = await dirSize(dir);
      if (size > MAX_APP_BYTES) err(`app folder is ${(size / 1048576).toFixed(1)} MB (limit 5 MB)`);

      dirs.set(m.slug, dir);
      const ext = path.extname(m.icon);
      apps.push({ ...m, effectiveScopes: effectiveScopes(m), iconUrl: `/app-icons/${m.slug}${ext}?v=${m.version}` });
    }
  }

  // Every full-app route folder must belong to a registered full app.
  const routeBase = path.join(root, "src", "app", "a");
  if (existsSync(routeBase)) {
    for (const e of await readdir(routeBase, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith("[")) continue;
      const a = apps.find((x) => x.slug === e.name);
      if (!a) errors.push(`src/app/a/${e.name}: no app with this slug in apps/`);
      else if (a.tier !== "full") errors.push(`src/app/a/${e.name}: app "${e.name}" is not a full app`);
    }
  }
  return { apps, tags, errors, dirs };
}

export async function buildRegistry(): Promise<RegistryApp[]> {
  const appDirs = [path.join(ROOT, "apps")];
  const extra = process.env.BAHAD_EXTRA_APPS_DIR;
  if (extra) {
    if (process.env.VERCEL_ENV === "production") throw new Error("BAHAD_EXTRA_APPS_DIR must never be set in production");
    appDirs.push(path.resolve(ROOT, extra));
    console.warn(`[registry] ⚠ including extra test apps from ${extra}`);
  }
  const { apps, tags, errors, dirs } = await collectApps(appDirs);
  if (errors.length) {
    throw new Error("[registry] ✖ invalid apps:\n" + errors.map((e) => "  - " + e).join("\n"));
  }

  await mkdir(path.join(ROOT, "src", "generated"), { recursive: true });
  const ts =
    "// GENERATED by scripts/build-registry.ts from apps/*/app.json — do not edit.\n" +
    'import type { RegistryApp } from "@/platform/manifest";\n\n' +
    `export const REGISTRY: RegistryApp[] = ${JSON.stringify(apps, null, 2)};\n\n` +
    `export const TAGS: string[] = ${JSON.stringify(tags)};\n`;
  await writeFile(path.join(ROOT, "src", "generated", "registry.ts"), ts);

  const pubApps = path.join(ROOT, "public", "apps");
  const pubIcons = path.join(ROOT, "public", "app-icons");
  await rm(pubApps, { recursive: true, force: true });
  await rm(pubIcons, { recursive: true, force: true });
  await mkdir(pubApps, { recursive: true });
  await mkdir(pubIcons, { recursive: true });
  for (const a of apps) {
    const dir = dirs.get(a.slug)!;
    if (a.tier === "simple") await cp(path.join(dir, "site"), path.join(pubApps, a.slug), { recursive: true });
    await cp(path.join(dir, a.icon), path.join(pubIcons, a.slug + path.extname(a.icon)));
  }
  console.log(`[registry] ✔ ${apps.length} apps: ${apps.map((a) => `${a.slug} (${a.tier}, ${a.status})`).join(", ")}`);
  return apps;
}

if (require.main === module) {
  buildRegistry().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
