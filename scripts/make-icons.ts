// Renders public/icons/icon.svg to the PNG sizes the web manifest and iOS need.
// Uses the Playwright Chromium (dev dependency). Run: pnpm icons
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

async function main() {
  const svg = await readFile(path.join(ROOT, "public/icons/icon.svg"), "utf8");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shots: { file: string; size: number; maskable?: boolean; flat?: boolean }[] = [
    { file: "icon-192.png", size: 192 },
    { file: "apple-touch-icon.png", size: 180, flat: true },
  ];
  for (const s of shots) {
    await page.setViewportSize({ width: s.size, height: s.size });
    // maskable: full-bleed background, artwork inside the 80% safe zone; apple: no rounded corners/transparency
    const inner = s.maskable || s.flat ? svg.replace(/rx="112"/, 'rx="0"') : svg;
    const scale = s.maskable ? 0.8 : 1;
    await page.setContent(
      `<html><body style="margin:0;background:${s.maskable || s.flat ? "#08142b" : "transparent"}">
        <div style="width:${s.size}px;height:${s.size}px;display:flex;align-items:center;justify-content:center">
          <div style="width:${s.size * scale}px;height:${s.size * scale}px">${inner.replace("<svg ", '<svg width="100%" height="100%" ')}</div>
        </div></body></html>`,
    );
    await page.screenshot({ path: path.join(ROOT, "public/icons", s.file), omitBackground: !(s.maskable || s.flat) });
    console.log("wrote", s.file);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
