// CI scope diff (plan 08): compares app.json between base and head and lists
// changes that need the owner's explicit approval:
//   * a new app, or an app adding the sensitive scopes "contact" / "push"
//   * a collection whose `read` gets wider (own < platoon < company < all)
//   * a collection whose `create` gets wider (admin < commander < any)
//   * a new collection that is readable beyond "own"
//   * `audience` or `moderate` changes
// Reads manifests from git as DATA only (safe to run in pull_request_target).
// Usage: tsx scripts/scope-diff.ts --base origin/main --head <sha> [--out comment.md]
import { writeFileSync, appendFileSync } from "node:fs";
import { listDirs, showFile } from "./lib/git";

type Json = Record<string, unknown>;
interface Coll {
  read?: string;
  create?: string;
  moderate?: string;
  maxPerUser?: number;
}
interface Man {
  slug?: string;
  scopes?: string[];
  audience?: string[];
  collections?: Record<string, Coll>;
  tier?: string;
  url?: string;
}

const READ = ["own", "platoon", "company", "all"];
const CREATE = ["admin", "commander", "any"];
const SENSITIVE = ["contact", "push"];

export interface ScopeDiff {
  needsApproval: boolean;
  lines: string[];
}

export function diffManifests(base: Record<string, Man | null>, head: Record<string, Man | null>): ScopeDiff {
  const lines: string[] = [];
  let needs = false;
  const flag = (s: string, sensitive = true) => {
    lines.push(`${sensitive ? "⚠️" : "ℹ️"} ${s}`);
    if (sensitive) needs = true;
  };
  for (const slug of Object.keys(head).sort()) {
    const h = head[slug];
    const b = base[slug] ?? null;
    if (!h) continue;
    const scopes = h.scopes ?? [];
    if (h.tier === "external" && (!b || b.url !== h.url)) flag(`**${slug}**: embeds an OUTSIDE site ${h.url} — check who runs it and what it collects`);
    if (!b) {
      flag(`**${slug}**: new ${h.tier ?? ""} app — scopes: ${["profile", ...scopes.filter((s) => s !== "profile")].join(", ") || "profile"}`, false);
      for (const s of scopes.filter((x) => SENSITIVE.includes(x))) flag(`**${slug}**: requests sensitive scope \`${s}\` — check the README justification`);
      for (const [c, r] of Object.entries(h.collections ?? {})) {
        lines.push(`ℹ️ **${slug}**.${c}: read=${r.read}, create=${r.create}, moderate=${r.moderate ?? "admin"}${r.maxPerUser ? `, maxPerUser=${r.maxPerUser}` : ""}`);
        if (r.read && r.read !== "own") flag(`**${slug}**.${c}: records are visible beyond their owner (read=${r.read})`);
      }
      continue;
    }
    for (const s of scopes.filter((x) => SENSITIVE.includes(x) && !(b.scopes ?? []).includes(x))) flag(`**${slug}**: adds sensitive scope \`${s}\``);
    const ba = JSON.stringify([...(b.audience ?? ["cadet", "commander", "admin"])].sort());
    const ha = JSON.stringify([...(h.audience ?? ["cadet", "commander", "admin"])].sort());
    if (ba !== ha) flag(`**${slug}**: audience ${ba} → ${ha}`, false);
    for (const [c, r] of Object.entries(h.collections ?? {})) {
      const o = b.collections?.[c];
      if (!o) {
        lines.push(`ℹ️ **${slug}**.${c}: new collection (read=${r.read}, create=${r.create}, moderate=${r.moderate ?? "admin"})`);
        if (r.read && r.read !== "own") flag(`**${slug}**.${c}: new collection visible beyond its owner (read=${r.read})`);
        continue;
      }
      if (READ.indexOf(r.read ?? "") > READ.indexOf(o.read ?? "")) flag(`**${slug}**.${c}: read widened ${o.read} → ${r.read}`);
      if (CREATE.indexOf(r.create ?? "") > CREATE.indexOf(o.create ?? "")) flag(`**${slug}**.${c}: create widened ${o.create} → ${r.create}`);
      if ((r.moderate ?? "admin") !== (o.moderate ?? "admin")) flag(`**${slug}**.${c}: moderate ${o.moderate ?? "admin"} → ${r.moderate ?? "admin"}`);
    }
  }
  for (const slug of Object.keys(base)) if (base[slug] && !head[slug]) lines.push(`ℹ️ **${slug}**: app removed`);
  return { needsApproval: needs, lines };
}

function manifestsAt(ref: string): Record<string, Man | null> {
  const out: Record<string, Man | null> = {};
  for (const slug of listDirs(ref, "apps")) {
    const text = showFile(ref, `apps/${slug}/app.json`);
    try {
      out[slug] = text ? (JSON.parse(text) as Json as Man) : null;
    } catch {
      out[slug] = null;
    }
  }
  return out;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (require.main === module) {
  const r = diffManifests(manifestsAt(arg("base") ?? "origin/main"), manifestsAt(arg("head") ?? "HEAD"));
  const md =
    "<!-- bahad-scope-diff -->\n### 🔐 Scope / data-rule changes\n\n" +
    (r.lines.length ? r.lines.map((l) => `- ${l}`).join("\n") : "No app permission changes.") +
    (r.needsApproval ? "\n\n**⚠️ Needs explicit owner approval** (see plan 04 / CONTRIBUTING.md)." : "") +
    "\n";
  console.log(md);
  const out = arg("out");
  if (out) writeFileSync(out, md);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `needs_approval=${r.needsApproval}\n`);
}
