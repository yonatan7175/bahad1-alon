// Builds the files simple apps load from the portal:
//   public/bahad.js   ← src/platform/client/standalone.ts (esbuild, IIFE)
//   public/bahad.css  ← src/platform/client/tokens.css + bahad-base.css
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

export async function buildBahadJs(): Promise<void> {
  const result = await build({
    entryPoints: [path.join(ROOT, "src/platform/client/standalone.ts")],
    bundle: true,
    format: "iife",
    target: ["es2020", "safari15", "chrome100"],
    minify: false,
    legalComments: "none",
    write: false,
    charset: "utf8",
  });
  const banner =
    "/*! bahad.js — Platform API v1 for simple apps of the Alon battalion portal.\n" +
    " *  Docs: /dev  ·  Types: /bahad.d.ts  ·  Generated from src/platform/client/standalone.ts — do not edit. */\n";
  await writeFile(path.join(ROOT, "public/bahad.js"), banner + result.outputFiles[0].text);

  const tokens = await readFile(path.join(ROOT, "src/platform/client/tokens.css"), "utf8");
  const base = await readFile(path.join(ROOT, "src/platform/client/bahad-base.css"), "utf8");
  await writeFile(
    path.join(ROOT, "public/bahad.css"),
    "/* bahad.css — generated from src/platform/client/{tokens,bahad-base}.css — do not edit. */\n" + tokens + "\n" + base,
  );
  console.log("[bahad.js] ✔ public/bahad.js, public/bahad.css");
}

if (require.main === module) {
  buildBahadJs().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
