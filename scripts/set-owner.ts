// One-time setup: pnpm set-owner <github-username>
// Writes the owner into bahad.config.json, replaces the REPLACE-ME placeholder in
// the sample apps' authors, and generates .github/CODEOWNERS.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { writeCodeowners } from "./gen-codeowners";

const user = process.argv[2];
if (!user || !/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(user) || user === "REPLACE-ME") {
  console.error("usage: pnpm set-owner <github-username>");
  process.exit(1);
}
const cfgPath = "bahad.config.json";
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
cfg.owner = user;
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
for (const slug of readdirSync("apps")) {
  const p = path.join("apps", slug, "app.json");
  if (!existsSync(p)) continue;
  const text = readFileSync(p, "utf8");
  if (text.includes('"REPLACE-ME"')) writeFileSync(p, text.replace(/"REPLACE-ME"/g, JSON.stringify(user)));
}
writeCodeowners();
console.log(`✔ owner set to @${user}`);
