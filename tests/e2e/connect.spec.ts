// "התחברות עם צ1" end to end, as an outside website sees it. Playwright plays the website
// (https://hub.frame.test is served by page.route), which loads the REAL /connect.js from the portal:
// suggest → קב״מית (+ directory) → admin → sign in → consent once → user + directory → disconnect.
import { expect, test, type BrowserContext } from "@playwright/test";
import { newUserPage } from "./helpers";

const SITE = "https://hub.frame.test/";

// Test setup only: the fake site is "public https" while the test portal is http://localhost, which Chrome's
// local-network protection blocks (the real portal is public https, so real sites never hit this).
test.use({
  launchOptions: { args: ["--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults"] },
});

/** The outside website: shows who is signed in and how many people it can see. Context-level so it also
 * answers the portal's 307 redirect back to the site (page-level routes don't see redirected navigations). */
async function serveSite(ctx: BrowserContext, portal: string) {
  await ctx.route("https://hub.frame.test/**", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html lang="he" dir="rtl"><body>
        <p id="who">…</p><p id="people"></p><p id="err"></p>
        <script src="${portal}/connect.js"></script>
        <script type="module">
          try {
            const user = await bahadConnect.requireUser();
            document.getElementById("who").textContent = "שלום " + user.name + " · " + user.scopes.join(",");
            const people = await bahadConnect.people();
            document.getElementById("people").textContent = people.length + " אנשים";
          } catch (e) { document.getElementById("err").textContent = (e.code || "") + " " + e.message; }
        </script></body></html>`,
    }),
  );
}

test("an outside website signs in with צ1 and reads the directory the קב״מית allowed", async ({ browser, baseURL }) => {
  const cadet = await newUserPage(browser, "cadet1@example.com");
  await cadet.page.goto("/a/add-app");
  await cadet.page.getByLabel("כתובת האתר").fill(SITE);
  await cadet.page.getByLabel(/^שם/).fill("האב הגדודי");
  await cadet.page.getByLabel("האתר מתחבר עם צ1").check();
  await cadet.page.getByLabel("האתר צריך את רשימת אנשי הגדוד").check();
  await cadet.page.getByRole("button", { name: "שליחה לאישור" }).click();
  await expect(cadet.page.locator("p[role=status]")).toContainText("הקב״מית ומנהל האתר");

  // Another user can't sign in to it before it's approved.
  const other = await newUserPage(browser, "cadet2@example.com");
  await serveSite(other.ctx, baseURL!);
  await other.page.goto(SITE);
  await expect(other.page.getByText("עדיין לא אושר")).toBeVisible();

  // The קב״מית approves the site and the directory; then the admin adds it.
  const kabam = await newUserPage(browser, "commander@example.com", "/a/add-app");
  const row = kabam.page.locator("li", { hasText: "האב הגדודי" }).filter({ has: kabam.page.getByTestId("kabam-review") });
  await row.getByLabel("לאשר גישה לרשימת אנשי הגדוד").check();
  await row.getByRole("button", { name: "אישור קב״מית", exact: true }).click();
  await expect(kabam.page.locator("p[role=status]")).toContainText("אושר ע״י הקב״מית");
  const admin = await newUserPage(browser, "admin@example.com", "/a/add-app");
  await admin.page.locator("li", { hasText: "האב הגדודי" }).getByRole("button", { name: "אישור — הוספה לאתר" }).click();
  await expect(admin.page.locator("p[role=status]")).toContainText("האב הגדודי");

  // First visit: consent screen (lists the directory), then back to the site, signed in.
  await other.page.goto(SITE);
  await expect(other.page.getByRole("heading", { name: "האב הגדודי" })).toBeVisible();
  await expect(other.page.getByText("רשימת אנשי הגדוד")).toBeVisible();
  await other.page.getByRole("button", { name: "אישור והמשך" }).click();
  await expect(other.page).toHaveURL(SITE); // code/state removed from the address bar
  await expect(other.page.locator("#who")).toHaveText("שלום נועה כהן · profile,directory");
  await expect(other.page.locator("#people")).toHaveText(/^\d+ אנשים$/);

  // A new tab (no token yet): the portal sends it straight back with a code — no consent screen this time.
  // (The site's own handling of the code was checked above. Playwright can't serve the fake site after a
  // server-side 307, so we check the redirect itself.)
  const again = await other.ctx.newPage();
  const [back] = await Promise.all([again.waitForRequest((r) => r.url().startsWith(`${SITE}?code=`)), again.goto(SITE).catch(() => null)]);
  expect(new URL(back.url()).searchParams.get("state")).toBeTruthy();
  await again.close();

  // The directory read is in the audit log.
  await admin.page.goto("/admin?tab=audit");
  await expect(admin.page.locator("tr", { hasText: "site.directory_read" }).first()).toBeVisible();

  // The user disconnects the site in their profile → the next visit asks again.
  await other.page.goto("/profile");
  await other.page.getByRole("button", { name: "ניתוק האב הגדודי" }).click();
  await expect(other.page.getByRole("button", { name: "ניתוק האב הגדודי" })).toHaveCount(0);
  const third = await other.ctx.newPage();
  await third.goto(SITE);
  await expect(third.getByRole("button", { name: "אישור והמשך" })).toBeVisible();

  // The admin removes the site (also keeps the shared e2e database clean for links.spec.ts).
  await admin.page.goto("/a/add-app");
  await admin.page.locator("li", { hasText: "האב הגדודי" }).getByRole("button", { name: "הסרה מדף הבית" }).click();
  await expect(admin.page.locator("p[role=status]")).toBeVisible();

  for (const c of [cadet, other, kabam, admin]) await c.ctx.close();
});

test("the authorize page refuses unknown sites and never redirects to them", async ({ browser }) => {
  const u = await newUserPage(browser, "cadet3@example.com");
  await u.page.goto("/oauth/authorize?redirect_uri=https%3A%2F%2Fevil.example%2F&state=x&code_challenge=" + "a".repeat(43) + "&code_challenge_method=S256");
  await expect(u.page.getByText("האתר הזה לא רשום להתחברות עם צ1")).toBeVisible();
  await expect(u.page).toHaveURL(/\/oauth\/authorize/);
  await u.ctx.close();
});
