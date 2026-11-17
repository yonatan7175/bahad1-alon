// CI static scan of SIMPLE apps' files (plan 08). Heuristic only — the real
// protection is the iframe sandbox + CSP — but it catches the usual mistakes
// early and points reviewers at suspicious lines.
// Usage: tsx scripts/scan-simple-apps.ts [apps-dir ...]   (default: apps)
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

export interface Finding {
  file: string;
  line: number;
  rule: string;
  text: string;
}

const RULES: { rule: string; re: RegExp }[] = [
  { rule: "external <script src>", re: /<script\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i },
  { rule: "external stylesheet/font <link>", re: /<link\b[^>]*\bhref\s*=\s*["']?\s*(?:https?:)?\/\//i },
  { rule: "external url() in CSS", re: /url\(\s*["']?\s*(?:https?:)?\/\//i },
  { rule: "external @import", re: /@import\s+(?:url\()?\s*["']?\s*(?:https?:)?\/\//i },
  { rule: "fetch() to another host", re: /\bfetch\s*\(\s*[`"']\s*(?:https?:)?\/\//i },
  { rule: "XMLHttpRequest", re: /\bXMLHttpRequest\b/ },
  { rule: "WebSocket", re: /\bnew\s+WebSocket\s*\(/ },
  { rule: "EventSource", re: /\bnew\s+EventSource\s*\(/ },
  { rule: "sendBeacon", re: /\bsendBeacon\s*\(/ },
  { rule: "dynamic import from URL", re: /\bimport\s*\(\s*[`"']\s*(?:https?:)?\/\//i },
  { rule: "eval", re: /\beval\s*\(/ },
  { rule: "new Function", re: /\bnew\s+Function\s*\(/ },
  { rule: "string timer (eval-like)", re: /\bset(?:Timeout|Interval)\s*\(\s*[`"']/ },
  { rule: "localStorage/sessionStorage", re: /\b(?:localStorage|sessionStorage)\b/ },
  { rule: "indexedDB", re: /\bindexedDB\b/ },
  { rule: "document.cookie", re: /\bdocument\.cookie\b/ },
  { rule: "<iframe>", re: /<iframe\b/i },
  { rule: "form posting to another host", re: /<form\b[^>]*\baction\s*=\s*["']?\s*(?:https?:)?\/\//i },
  { rule: "window.open to another host", re: /\bwindow\.open\s*\(\s*[`"']\s*(?:https?:)?\/\//i },
  { rule: "link/image to another host (possible exfiltration)", re: /\b(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\/(?!localhost)/i },
  { rule: "top/parent navigation", re: /\b(?:top|parent)\.location\b|\bwindow\.top\b/ },
];

const TEXT_EXT = new Set([".html", ".htm", ".js", ".mjs", ".css", ".svg", ".json", ".txt", ".md"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

export function scanText(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const { rule, re } of RULES) {
      if (re.test(line)) findings.push({ file, line: i + 1, rule, text: line.trim().slice(0, 160) });
    }
  });
  return findings;
}

export function scanApps(appsDirs: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const base of appsDirs) {
    if (!existsSync(base)) continue;
    for (const slug of readdirSync(base)) {
      const site = path.join(base, slug, "site");
      if (!existsSync(site) || !statSync(site).isDirectory()) continue;
      for (const f of walk(site)) {
        if (!TEXT_EXT.has(path.extname(f).toLowerCase())) continue;
        findings.push(...scanText(f, readFileSync(f, "utf8")));
      }
    }
  }
  return findings;
}

if (require.main === module) {
  const dirs = process.argv.slice(2);
  const findings = scanApps(dirs.length ? dirs : ["apps"]);
  if (!findings.length) {
    console.log("✔ static scan: no suspicious patterns in simple apps");
  } else {
    console.error(`✖ static scan: ${findings.length} finding(s) — remove them, or explain in the PR why they are safe:`);
    for (const f of findings) {
      console.error(`  ${f.file}:${f.line}  [${f.rule}]  ${f.text}`);
      if (process.env.GITHUB_ACTIONS) console.log(`::error file=${f.file},line=${f.line}::${f.rule}`);
    }
    process.exit(1);
  }
}
