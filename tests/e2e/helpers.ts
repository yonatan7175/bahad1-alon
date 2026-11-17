import { expect, type Browser, type Page } from "@playwright/test";

export const OUTSIDE = "http://127.0.0.1:3299";

export async function outsideHits(): Promise<string[]> {
  return (await fetch(`${OUTSIDE}/__hits`)).json();
}
export async function resetOutside() {
  await fetch(`${OUTSIDE}/__reset`);
}

/** Signs in with a seeded mock user (see src/platform/auth/mock.ts). */
export async function signIn(page: Page, email: string, next = "/") {
  await page.goto(`/signin?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`mock-login-${email}`).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"));
}

export async function newUserPage(browser: Browser, email: string, next = "/") {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, email, next);
  return { ctx, page };
}

/** Calls the Platform API as the signed-in page (same-origin fetch). */
export async function api<T = unknown>(page: Page, app: string, method: string, params: object = {}): Promise<{ result?: T; error?: { code: string; message: string } }> {
  return page.evaluate(
    async ([app, method, params]) => {
      const r = await fetch("/api/platform/call", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app, method, params }) });
      return r.json();
    },
    [app, method, params] as const,
  );
}

export async function expectNoOutsideHits() {
  // give stray requests a moment to arrive
  await new Promise((r) => setTimeout(r, 500));
  expect(await outsideHits()).toEqual([]);
}
