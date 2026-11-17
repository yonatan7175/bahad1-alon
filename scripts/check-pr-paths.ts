// CI path guard (plan 08): a contributor PR may only touch ONE app's folders:
//   apps/<slug>/**   and, for a full app,   src/app/a/<slug>/**
// Anything else (core code, apps/tags.json, CI, docs…) needs the "core" label,
// which only the owner can add.
// Usage: tsx scripts/check-pr-paths.ts --base origin/main --head HEAD [--labels core,foo]
import { readFileSync } from "node:fs";
import { changedFiles } from "./lib/git";

export interface PathCheck {
  ok: boolean;
  apps: string[];
  coreFiles: string[];
  messages: string[];
}

const APP_RE = /^apps\/([a-z0-9-]{3,32})\/.+/;
const ROUTE_RE = /^src\/app\/a\/([a-z0-9-]{3,32})\/.+/;

export function checkPaths(files: string[], labels: string[], coreLabel = "core"): PathCheck {
  const apps = new Set<string>();
  const coreFiles: string[] = [];
  for (const f of files) {
    const m = APP_RE.exec(f) ?? ROUTE_RE.exec(f);
    if (m) apps.add(m[1]);
    else coreFiles.push(f);
  }
  const hasCore = labels.includes(coreLabel);
  const messages: string[] = [];
  if (coreFiles.length && !hasCore) {
    messages.push(`This PR changes files outside an app folder (needs the "${coreLabel}" label from the owner):`);
    messages.push(...coreFiles.map((f) => `  - ${f}`));
  }
  if (apps.size > 1 && !hasCore) {
    messages.push(`This PR touches ${apps.size} apps (${[...apps].join(", ")}). Please send one app per PR.`);
  }
  return { ok: messages.length === 0, apps: [...apps], coreFiles, messages };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (require.main === module) {
  const base = arg("base") ?? "origin/main";
  const head = arg("head") ?? "HEAD";
  let labels = (arg("labels") ?? "").split(",").filter(Boolean);
  if (!arg("labels") && process.env.GITHUB_EVENT_PATH) {
    const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    labels = (ev.pull_request?.labels ?? []).map((l: { name: string }) => l.name);
  }
  const coreLabel = JSON.parse(readFileSync("bahad.config.json", "utf8")).coreLabel ?? "core";
  const r = checkPaths(changedFiles(base, head), labels, coreLabel);
  if (r.ok) {
    console.log(`✔ path guard: ${r.apps.length ? `app(s): ${r.apps.join(", ")}` : "no app files"}${r.coreFiles.length ? ` + ${r.coreFiles.length} core file(s) (label "${coreLabel}")` : ""}`);
  } else {
    console.error("✖ path guard\n" + r.messages.join("\n"));
    process.exit(1);
  }
}
