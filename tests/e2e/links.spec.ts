// "הוספת אפליקציה": an approved website opens INSIDE the portal (like a built-in app) when it allows
// framing, and in a new tab when it doesn't. The probe runs with BAHAD_EMBED_PROBE_FAKE=1 (see
// playwright.config.ts): *.frame.test can be framed, every other host answers X-Frame-Options: DENY.
import { expect, test, type Page } from "@playwright/test";
import { newUserPage } from "./helpers";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

async function suggest(page: Page, url: string, name: string) {
  await page.goto("/a/add-app");
  await page.getByLabel("כתובת האתר").fill(url);
  await page.getByLabel(/^שם/).fill(name);
  await page.getByRole("button", { name: "שליחה לאישור מנהל" }).click();
  await expect(page.locator("p[role=status]")).toContainText("ההצעה נשלחה");
}

test("approved websites open inside the portal when they allow it", async ({ browser }) => {
  const cadet = await newUserPage(browser, "cadet2@example.com");
  await suggest(cadet.page, "https://tool.frame.test/start", "כלי בתוך האתר");
  await suggest(cadet.page, "https://blocked.example.test/", "אתר שחוסם");
  // the submitter already sees how each one will open
  await expect(cadet.page.locator("li", { hasText: "כלי בתוך האתר" }).getByTestId("embed-status")).toContainText("נפתח בתוך האתר");
  await expect(cadet.page.locator("li", { hasText: "אתר שחוסם" }).getByTestId("embed-status")).toContainText("נפתח בלשונית חדשה");

  const admin = await newUserPage(browser, "admin@example.com", "/a/add-app");
  for (const name of ["כלי בתוך האתר", "אתר שחוסם"]) {
    await admin.page.locator("li", { hasText: name }).getByRole("button", { name: "אישור — הוספה לאתר" }).click();
    await expect(admin.page.locator("p[role=status]")).toContainText(name);
  }

  // Home: the frameable site is a normal in-portal tile, the other one still opens a new tab.
  await cadet.page.goto("/");
  const inside = cadet.page.getByRole("link", { name: "כלי בתוך האתר" });
  await expect(inside).toHaveAttribute("href", new RegExp(`^/l/${UUID}/tool\\.frame\\.test$`));
  await expect(inside).not.toHaveAttribute("target", "_blank");
  const outside = cadet.page.getByRole("link", { name: /אתר שחוסם/ });
  await expect(outside).toHaveAttribute("target", "_blank");
  await expect(outside).toHaveAttribute("href", "https://blocked.example.test/");

  // The in-portal page: app frame + sandboxed iframe; frame-src allows ONLY that site.
  const href = (await inside.getAttribute("href"))!;
  const res = await cadet.page.goto(href);
  expect(res!.headers()["content-security-policy"]).toContain("frame-src 'self' https://tool.frame.test;");
  await expect(cadet.page.getByTestId("app-title")).toHaveText("כלי בתוך האתר");
  const frame = cadet.page.getByTestId("external-app-frame");
  await expect(frame).toHaveAttribute("src", "https://tool.frame.test/start");
  await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  const sandbox = (await frame.getAttribute("sandbox"))!;
  expect(sandbox).toContain("allow-scripts");
  expect(sandbox).not.toContain("allow-top-navigation");
  // ⋮ menu → "open in a new tab" points at the site
  await cadet.page.getByRole("button", { name: "תפריט" }).click();
  await expect(cadet.page.getByRole("menuitem", { name: "פתיחה בלשונית חדשה" })).toHaveAttribute("href", "https://tool.frame.test/start");

  // /l/<id> alone redirects to the canonical page
  const id = new RegExp(`/l/(${UUID})/`).exec(href)![1];
  await cadet.page.goto(`/l/${id}`);
  await expect(cadet.page).toHaveURL(new RegExp(`${href}$`));

  // Admin forces "always a new tab" → the tile changes; back to automatic → inside again.
  const row = admin.page.locator("li", { hasText: "כלי בתוך האתר" }).filter({ has: admin.page.getByRole("button", { name: "בדיקה מחדש" }) });
  await row.getByRole("button", { name: "תמיד בלשונית" }).click();
  await expect(admin.page.locator("p[role=status]")).toContainText("ייפתח בלשונית חדשה");
  await cadet.page.goto("/");
  await expect(cadet.page.getByRole("link", { name: /כלי בתוך האתר/ })).toHaveAttribute("target", "_blank");
  await cadet.page.goto(href);
  await expect(cadet.page.getByTestId("link-app-launcher")).toBeVisible();
  await expect(cadet.page.getByTestId("external-app-frame")).toHaveCount(0);

  await admin.page.locator("li", { hasText: "כלי בתוך האתר" }).filter({ has: admin.page.getByRole("button", { name: "בדיקה מחדש" }) }).getByRole("button", { name: "אוטומטי" }).click();
  await expect(admin.page.locator("p[role=status]")).toContainText("לפי הבדיקה האוטומטית");
  await admin.page.locator("li", { hasText: "כלי בתוך האתר" }).filter({ has: admin.page.getByRole("button", { name: "בדיקה מחדש" }) }).getByRole("button", { name: "בדיקה מחדש" }).click();
  await expect(admin.page.locator("p[role=status]")).toContainText("האתר מאפשר הצגה בתוך הפורטל");
  await admin.page.getByRole("button", { name: "בדיקה מחדש של כל האתרים" }).click();
  await expect(admin.page.locator("p[role=status]")).toContainText("נבדקו 2 אתרים — 1 נפתחים בתוך האתר");
  await cadet.page.goto("/");
  await expect(cadet.page.getByRole("link", { name: "כלי בתוך האתר" })).toHaveAttribute("href", href);

  // Every admin decision is audited.
  await admin.page.goto("/admin?tab=audit");
  await expect(admin.page.locator("tr", { hasText: "app.submission.embed_mode" }).first()).toBeVisible();

  await admin.ctx.close();
  await cadet.ctx.close();
});

test("a hand-made /l/ path can never frame another site", async ({ browser }) => {
  const admin = await newUserPage(browser, "admin@example.com");
  const cadet = await newUserPage(browser, "cadet3@example.com");
  await suggest(cadet.page, "https://safe.frame.test/", "אתר בטוח");
  await admin.page.goto("/a/add-app");
  await admin.page.locator("li", { hasText: "אתר בטוח" }).getByRole("button", { name: "אישור — הוספה לאתר" }).click();
  await expect(admin.page.locator("p[role=status]")).toContainText("נפתח בתוך האתר");

  await cadet.page.goto("/");
  const href = (await cadet.page.getByRole("link", { name: "אתר בטוח" }).getAttribute("href"))!;
  const id = new RegExp(`/l/(${UUID})/`).exec(href)![1];

  // wrong host in the path → redirected to the real one; the evil origin is never framed
  await cadet.page.goto(`/l/${id}/evil.example`);
  await expect(cadet.page).toHaveURL(new RegExp(`/l/${id}/safe\\.frame\\.test$`));
  await expect(cadet.page.getByTestId("external-app-frame")).toHaveAttribute("src", "https://safe.frame.test/");

  // unknown / malformed ids → 404, and their CSP still frames nothing outside
  for (const p of [`/l/00000000-0000-4000-8000-000000000000/evil.example`, `/l/nope/evil.example`]) {
    const r = await cadet.page.goto(p);
    expect(r!.status(), p).toBe(404);
    await expect(cadet.page.getByTestId("external-app-frame")).toHaveCount(0);
  }
  // CSP injection attempts through the path never reach the header
  const r = await cadet.page.request.get(`/l/${id}/evil.example;script-src%20*`, { maxRedirects: 0 });
  expect(r.headers()["content-security-policy"]).toMatch(/frame-src 'self';/);
  expect(r.headers()["content-security-policy"]).not.toContain("evil");
  // …and following the redirect lands on the real site only
  await cadet.page.goto(`/l/${id}/evil.example;script-src%20*`);
  await expect(cadet.page).toHaveURL(new RegExp(`/l/${id}/safe\\.frame\\.test$`));

  // every other portal page keeps frame-src 'self'
  for (const p of ["/", "/a/add-app", "/profile"]) {
    const res = await cadet.page.goto(p);
    expect(res!.headers()["content-security-policy"], p).toMatch(/frame-src 'self';/);
  }

  // signed out → sign-in, nothing rendered
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(href);
  await expect(anon).toHaveURL(/\/signin/);
  await anon.context().close();
  await admin.ctx.close();
  await cadet.ctx.close();
});
