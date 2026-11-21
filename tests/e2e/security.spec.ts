// Phase 2 "done when": a sample evil app tries to read cookies, call outside servers,
// claim another slug, read other users' `own` records, and run when opened directly.
// ALL attempts must fail.
import { expect, test, type Frame, type Page } from "@playwright/test";
import { api, expectNoOutsideHits, newUserPage, OUTSIDE, outsideHits, resetOutside, signIn } from "./helpers";

type Results = Record<string, { blocked: boolean; detail: string } | unknown>;

async function runEvil(page: Page, query = ""): Promise<{ results: Results; frame: Frame }> {
  await page.goto("/a/evil-app");
  const el = await page.waitForSelector('[data-testid="simple-app-frame"]');
  const frame = (await el.contentFrame())!;
  if (query) {
    // Reload the frame with test parameters (the host page never forwards its own URL to the app).
    await el.evaluate((f, q) => ((f as HTMLIFrameElement).src = `/apps/evil-app/index.html?${q}`), query);
    await expect.poll(() => frame.url()).toContain(`?${query}`);
  }
  await frame.waitForSelector("body[data-done='1']", { timeout: 30_000 });
  const text = await frame.locator("#results").textContent();
  return { results: JSON.parse(text!), frame };
}

test.beforeEach(async () => {
  await resetOutside();
});

test("simple-app responses carry the sandbox CSP", async ({ request }) => {
  const r = await request.get("/apps/evil-app/index.html");
  const csp = r.headers()["content-security-policy"];
  expect(csp).toContain("sandbox allow-scripts allow-forms allow-popups");
  expect(csp).not.toContain("allow-same-origin");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toMatch(/default-src 'none'/);
});

test("portal pages carry a nonce CSP that only frames same-origin content", async ({ page }) => {
  await signIn(page, "cadet1@example.com");
  const r = await page.goto("/");
  const csp = r!.headers()["content-security-policy"];
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-src 'self'");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).not.toContain("unsafe-eval");
});

test("evil app inside the portal: every attack is blocked", async ({ page }) => {
  await signIn(page, "cadet1@example.com");
  const { results } = await runEvil(page);
  expect(results.inPortal).toBe(true);
  expect(results.isMock).toBe(false);
  for (const k of ["readCookies", "localStorage", "parentDocument", "parentLocation", "fetchExternal", "imageExternal", "apiDirect", "claimOtherApp", "unknownMethod", "topNavigation"]) {
    expect(results[k], k).toMatchObject({ blocked: true });
  }
  // beacon: either refused, or CSP-blocked silently — verified by the outside server below
  // profile scope only: user.me must not leak role/unit/contact
  expect((results.me as { keys: string[] }).keys).toEqual(["avatarUrl", "id", "name"]);
  await expectNoOutsideHits();
  // the top window was not navigated away
  expect(new URL(page.url()).pathname).toBe("/a/evil-app");
});

test("evil app cannot read, change or delete another user's `own` records", async ({ browser }) => {
  const b = await newUserPage(browser, "cadet2@example.com");
  const added = await api<{ id: string }>(b.page, "evil-app", "data.add", { collection: "secrets", data: { who: "B" } });
  expect(added.result?.id).toBeTruthy();
  const targetId = added.result!.id;

  const a = await newUserPage(browser, "cadet1@example.com");
  const { results } = await runEvil(a.page, `write=A&target=${targetId}`);
  expect(results.listedOwners).toEqual(["A"]);
  for (const k of ["getOthersRecord", "updateOthersRecord", "removeOthersRecord"]) {
    expect(results[k], k).toMatchObject({ blocked: true });
    expect((results[k] as { detail: string }).detail, k).toMatch(/not found/);
  }
  // B's record is untouched
  const still = await api<{ data: { who: string } }>(b.page, "evil-app", "data.get", { collection: "secrets", id: targetId });
  expect(still.result?.data.who).toBe("B");
  await a.ctx.close();
  await b.ctx.close();
});

test("an app frame cannot navigate itself to another site", async ({ page }) => {
  await signIn(page, "cadet1@example.com");
  await page.goto("/a/evil-app");
  const frameEl = await page.waitForSelector('[data-testid="simple-app-frame"]');
  const frame = (await frameEl.contentFrame())!;
  await frame.waitForSelector("body[data-done='1']");
  // Two-step: load another same-origin page of the app, which redirects to an outside URL.
  await frame.evaluate(() => {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the attack under test
    location.href = "/apps/evil-app/navigate.html";
  });
  await page.waitForTimeout(2500);
  expect(await outsideHits()).toEqual([]);
  // direct attempt from the frame too
  await (await frameEl.contentFrame())!.evaluate((o) => {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the attack under test
    location.href = `${o}/exfil-direct-nav`;
  }, OUTSIDE).catch(() => {});
  await page.waitForTimeout(2000);
  expect(await outsideHits()).toEqual([]);
});

test("opened directly (outside the portal) the app is still sandboxed and gets no session", async ({ page }) => {
  await signIn(page, "cadet1@example.com");
  await page.goto("/apps/evil-app/index.html");
  await page.waitForSelector("body[data-done='1']");
  const results = JSON.parse((await page.locator("#results").textContent())!);
  expect(results.inPortal).toBe(false);
  expect(results.isMock).toBe(true); // bahad.js falls back to mock mode, never the real API
  for (const k of ["readCookies", "localStorage", "fetchExternal", "imageExternal", "apiDirect"]) {
    expect(results[k], k).toMatchObject({ blocked: true });
  }
  // origin is opaque even though the URL is same-origin
  expect(await page.evaluate(() => window.origin)).toBe("null");
  await expectNoOutsideHits();
});

test("the Platform API rejects cross-origin and sessionless calls", async ({ request, page }) => {
  const noOrigin = await request.post("/api/platform/call", { data: { app: "hello-simple", method: "user.me", params: {} } });
  expect(noOrigin.status()).toBe(403);
  const evilOrigin = await request.post("/api/platform/call", {
    data: { app: "hello-simple", method: "user.me", params: {} },
    headers: { origin: "https://evil.example" },
  });
  expect(evilOrigin.status()).toBe(403);
  const nullOrigin = await request.post("/api/platform/call", { data: { app: "hello-simple", method: "user.me" }, headers: { origin: "null" } });
  expect(nullOrigin.status()).toBe(403);
  await page.goto("/signin");
  const anon = await api(page, "hello-simple", "user.me");
  expect(anon.error?.code).toBe("unauthorized");
});

test("kill switch: a disabled app is refused by the API and its page", async ({ browser }) => {
  const admin = await newUserPage(browser, "admin@example.com", "/admin?tab=apps");
  const row = admin.page.locator("li", { hasText: "/evil-app" });
  await row.locator('select[name="status"]').selectOption("disabled");
  await row.locator('input[name="reason"]').fill("בדיקה");
  await row.getByRole("button", { name: "עדכון" }).click();
  await admin.page.waitForURL(/ok=/);

  const cadet = await newUserPage(browser, "cadet1@example.com");
  expect((await api(cadet.page, "evil-app", "user.me")).error?.code).toBe("app_disabled");
  await cadet.page.goto("/a/evil-app");
  await expect(cadet.page.getByText("האפליקציה הושבתה זמנית על ידי מנהל: בדיקה")).toBeVisible();

  await admin.page.goto("/admin?tab=apps");
  const row2 = admin.page.locator("li", { hasText: "/evil-app" });
  await row2.locator('select[name="status"]').selectOption("none");
  await row2.getByRole("button", { name: "עדכון" }).click();
  await admin.page.waitForURL(/ok=/);
  expect((await api(cadet.page, "evil-app", "user.me")).result).toBeTruthy();
  await admin.ctx.close();
  await cadet.ctx.close();
});

test("an external app may be framed ONLY on its own page", async ({ page }) => {
  await signIn(page, "cadet1@example.com");
  const ext = await page.goto("/a/officer-character");
  expect(ext!.headers()["content-security-policy"]).toContain("frame-src 'self' https://write.bahad1.com");
  await expect(page.getByTestId("external-app-frame")).toHaveAttribute("src", "https://write.bahad1.com/");
  const sandbox = await page.getByTestId("external-app-frame").getAttribute("sandbox");
  expect(sandbox).toContain("allow-scripts");
  // every other page — including simple-app hosts — still frames same-origin only
  for (const p of ["/a/evil-app", "/a/hello-simple", "/"]) {
    const r = await page.goto(p);
    expect(r!.headers()["content-security-policy"], p).toMatch(/frame-src 'self';/);
  }
});
