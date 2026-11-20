// Functional end-to-end flows (Phase 1–3 "done when" checks that can run headless).
import { expect, test } from "@playwright/test";
import { api, newUserPage, signIn } from "./helpers";

test("new user: sign-in → onboarding → account created right away → home", async ({ browser }) => {
  const u = await (await browser.newContext()).newPage();
  await u.goto("/");
  await expect(u).toHaveURL(/\/signin/);
  const email = `new-${Date.now()}@example.com`;
  await u.getByText("הדמיית כניסה ראשונה").click();
  await u.locator("#mock-name").fill("New Google User");
  await u.locator("#mock-email").fill(email);
  await u.getByRole("button", { name: "כניסה כמשתמש חדש" }).click();
  await expect(u).toHaveURL(/\/onboarding/);
  // not registered yet: no API, every page leads back to the form
  expect((await api(u, "laundry", "user.me")).error?.code).toBe("forbidden");

  // English name is rejected (Hebrew required)
  await u.locator("#name").fill("New User");
  await u.locator("#company").selectOption({ label: "פלוגה ב'" });
  await u.locator("#team").fill("3");
  await u.locator("#room").fill("241");
  await u.locator("#phone").fill("0521234567");
  await u.getByRole("button", { name: "סיום הרשמה וכניסה" }).click();
  await expect(u.locator("form [role=alert]")).toContainText("שם מלא בעברית");
  // the typed values survive the failed submit
  await expect(u.locator("#company")).toHaveValue(/.+/);
  await expect(u.locator("#phone")).toHaveValue("0521234567");

  // Open registration (default; BAHAD_REQUIRE_APPROVAL=1 brings back admin approval): straight in.
  await u.locator("#name").fill("משתמשת חדשה");
  await u.getByRole("button", { name: "סיום הרשמה וכניסה" }).click();
  await expect(u).toHaveURL((url) => url.pathname === "/");
  await expect(u.locator("h1")).toContainText("משתמשת");
  const me = await api<{ name: string; company: { name: string }; room: string }>(u, "dorm", "user.me");
  expect(me.result?.name).toBe("משתמשת חדשה");
  expect(me.result?.company.name).toBe("פלוגה ב'");
  expect(me.result?.room).toBe("241");

  // the audit log records the automatic approval
  const admin = await newUserPage(browser, "admin@example.com", "/admin?tab=audit");
  await expect(admin.page.locator("tr", { hasText: "user.auto_approve" }).first()).toContainText("משתמשת חדשה");
  await admin.ctx.close();
});

test("blocking signs a user out of everything immediately", async ({ browser }) => {
  const victim = await newUserPage(browser, "cadet4@example.com");
  expect((await api(victim.page, "hello-simple", "user.me")).result).toBeTruthy();
  const admin = await newUserPage(browser, "admin@example.com", "/admin?tab=users&q=מאיה");
  const row = admin.page.locator("li", { hasText: "מאיה פרץ" });
  await row.locator("summary").click();
  await row.getByRole("button", { name: /חסימה/ }).click();
  await admin.page.waitForURL(/ok=/);
  expect((await api(victim.page, "hello-simple", "user.me")).error?.code).toBe("forbidden");
  await victim.page.goto("/");
  await expect(victim.page).toHaveURL(/\/blocked/);
  // unblock again for other tests
  await admin.page.goto("/admin?tab=users&q=מאיה");
  const row2 = admin.page.locator("li", { hasText: "מאיה פרץ" });
  await row2.locator("summary").click();
  await row2.getByRole("button", { name: "הסרת חסימה" }).click();
  await admin.page.waitForURL(/ok=/);
  expect((await api(victim.page, "hello-simple", "user.me")).result).toBeTruthy();
  await admin.ctx.close();
  await victim.ctx.close();
});

test("an admin cannot block or demote themselves (no lockout)", async ({ page }) => {
  await signIn(page, "admin@example.com", "/admin?tab=users&q=מנהל");
  const row = page.locator("li", { hasText: "מנהל המערכת" });
  await row.locator("summary").click();
  await row.getByRole("button", { name: /חסימה/ }).click();
  await expect(page.locator("main [role=alert]")).toContainText("אי אפשר לחסום את עצמך");
});

test("home: search is Hebrew-aware, tags filter and sync to the URL; hidden apps only for admins", async ({ browser }) => {
  const c = await newUserPage(browser, "cadet1@example.com");
  const p = c.page;
  await expect(p.getByRole("link", { name: /לו"ז מכונות כביסה/ })).toBeVisible();
  await expect(p.getByRole("link", { name: /ריכוז חוסרים/ })).toHaveCount(0); // status hidden
  await p.getByPlaceholder(/חיפוש אפליקציה/).fill("לוז כביסה");
  await expect(p.getByRole("link", { name: /לו"ז מכונות כביסה/ })).toBeVisible();
  await expect(p.getByRole("link", { name: /שלום עולם/ })).toHaveCount(0);
  await p.getByPlaceholder(/חיפוש אפליקציה/).fill("");
  await p.getByRole("button", { name: "כלים" }).click();
  await expect(p).toHaveURL(/\?tag=/);
  await expect(p.getByRole("link", { name: /לו"ז מכונות כביסה/ })).toHaveCount(0);
  await expect(p.getByRole("link", { name: /שלום עולם \(פשוטה\)/ })).toBeVisible();
  // shared filtered link opens filtered
  await p.goto(`/?tag=${encodeURIComponent("יומיומי")}`);
  await expect(p.getByRole("link", { name: /לו"ז מכונות כביסה/ })).toBeVisible();
  await expect(p.getByRole("link", { name: /שלום עולם/ })).toHaveCount(0);
  // hidden app is not reachable by URL either
  const r = await p.goto("/a/shortages");
  expect(r?.status()).toBe(404);
  await c.ctx.close();

  const a = await newUserPage(browser, "admin@example.com");
  await expect(a.page.getByRole("link", { name: /ריכוז חוסרים/ })).toBeVisible();
  await a.ctx.close();
});

test("simple app: notes are private, the platoon board updates live for others", async ({ browser }) => {
  const A = await newUserPage(browser, "cadet1@example.com", "/a/hello-simple");
  const B = await newUserPage(browser, "cadet2@example.com", "/a/hello-simple"); // same platoon
  const C = await newUserPage(browser, "cadet3@example.com", "/a/hello-simple"); // other platoon
  const fa = A.page.frameLocator('[data-testid="simple-app-frame"]');
  const fb = B.page.frameLocator('[data-testid="simple-app-frame"]');
  const fc = C.page.frameLocator('[data-testid="simple-app-frame"]');
  for (const f of [fa, fb, fc]) await expect(f.locator("#hello")).toContainText("שלום, ");

  const note = `סוד-${Date.now()}`;
  await fa.locator("#note").fill(note);
  await fa.locator("#note-form button").click();
  await expect(fa.locator("#notes")).toContainText(note);

  const post = `הודעה-${Date.now()}`;
  await fa.locator("#post").fill(post);
  await fa.locator("#board-form button").click();
  // B sees it live (no reload); C (other platoon) never does
  await expect(fb.locator("#board")).toContainText(post, { timeout: 15_000 });
  await B.page.reload();
  await expect(fb.locator("#notes")).not.toContainText(note);
  await C.page.reload();
  await expect(fc.locator("#hello")).toContainText("שלום, ");
  await expect(fc.locator("#board")).not.toContainText(post);
  await expect(A.page.getByTestId("app-title")).toContainText("שלום עולם");
  for (const x of [A, B, C]) await x.ctx.close();
});

test("laundry: calendar booking, live for others, weekly limit, my bookings, finder", async ({ browser }) => {
  const A = await newUserPage(browser, "cadet1@example.com", "/a/laundry");
  const B = await newUserPage(browser, "cadet4@example.com", "/a/laundry"); // other company — machines are shared
  // next week's Wednesday: always in the future and inside the 4-week booking window
  for (const p of [A.page, B.page]) {
    await p.getByRole("button", { name: "השבוע הבא" }).click();
    await p.getByRole("group", { name: "בחירת יום" }).getByRole("button").nth(3).click();
  }
  const dialog = A.page.getByRole("dialog");

  // book the floor-1 washer at 20:00 (40-minute slots)
  await A.page.getByRole("button", { name: "כביסה · קומה 1 20:00–20:40 פנוי — שריון" }).click();
  await expect(dialog).toContainText("כביסה · קומה 1");
  await expect(dialog).toContainText("יוצגו במשבצת");
  await dialog.getByRole("button", { name: "שריון", exact: true }).click();
  await expect(A.page.getByRole("button", { name: "כביסה · קומה 1 20:00–20:40 השריון שלי" })).toBeVisible();
  // B sees it taken, live — with the booker's name (and phone, when the profile has one) on the slot
  const taken = B.page.getByRole("button", { name: /כביסה · קומה 1 20:00–20:40 תפוס ע"י ישראל ישראלי/ });
  await expect(taken).toBeVisible({ timeout: 15_000 });
  await expect(taken).toContainText("ישראל ישראלי");
  await taken.click();
  await expect(B.page.getByTestId("booker-card")).toContainText("ישראל ישראלי");
  await expect(B.page.getByRole("dialog").getByRole("button", { name: /ביטול|פינוי/ })).toHaveCount(0); // a cadet can't free others' slots
  await B.page.keyboard.press("Escape");

  // second washer booking OK, third blocked by the weekly limit (2 washes / week)
  await A.page.getByRole("button", { name: "כביסה · קומה 3 21:20–22:00 פנוי — שריון" }).click();
  await dialog.getByRole("button", { name: "שריון", exact: true }).click();
  await expect(A.page.getByRole("button", { name: "כביסה · קומה 3 21:20–22:00 השריון שלי" })).toBeVisible();
  await A.page.getByRole("button", { name: "כביסה · קומה 1 22:00–22:40 פנוי — שריון" }).click();
  await expect(dialog).toContainText("ניצלת את 2");
  await expect(dialog.getByRole("button", { name: "שריון", exact: true })).toBeDisabled();
  await A.page.keyboard.press("Escape");
  // the dryer is a separate quota
  await A.page.getByRole("radio", { name: /ייבוש/ }).click();
  await A.page.getByRole("button", { name: "מייבש 20:40–21:20 פנוי — שריון" }).click();
  await dialog.getByRole("button", { name: "שריון", exact: true }).click();
  await expect(A.page.getByRole("button", { name: "מייבש 20:40–21:20 השריון שלי" })).toBeVisible();

  // far ahead (5 weeks) is view-only; the month picker jumps back
  for (let i = 0; i < 5; i++) await A.page.getByRole("button", { name: "השבוע הבא" }).click();
  await expect(A.page.getByText(/צפייה בלבד — אפשר לשריין עד 4 שבועות/)).toBeVisible();
  await expect(A.page.getByRole("button", { name: /פנוי — שריון/ })).toHaveCount(0);
  await A.page.getByRole("button", { name: "היום" }).click();
  await expect(A.page.getByText(/צפייה בלבד/)).toHaveCount(0);
  await A.page.getByRole("button", { name: /בחירת תאריך/ }).click();
  await expect(dialog).toContainText("מעבר לתאריך");
  await A.page.keyboard.press("Escape");

  // my bookings: 3 upcoming; cancel one
  await A.page.getByRole("button", { name: "שלי", exact: true }).click();
  await expect(A.page.getByTestId("my-booking")).toHaveCount(3);
  await A.page.getByTestId("my-booking").first().click();
  await dialog.getByRole("button", { name: "ביטול השריון" }).click();
  await expect(A.page.getByTestId("my-booking")).toHaveCount(2);

  // finder: shows free slots and books from a result
  await A.page.getByRole("button", { name: "חיפוש", exact: true }).click();
  await A.page.getByRole("radio", { name: /ייבוש/ }).click();
  await A.page.getByRole("button", { name: "מחר", exact: true }).click();
  await A.page.getByTestId("free-slot").first().click();
  await expect(dialog).toContainText("שריון משבצת");
  await dialog.getByRole("button", { name: "שריון", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await A.ctx.close();
  await B.ctx.close();
});

test("directory: everyone sees everyone; phone/email can be hidden", async ({ browser }) => {
  const A = await newUserPage(browser, "cadet2@example.com", "/profile");
  await A.page.locator("#phone").fill("0527777777");
  await A.page.getByRole("button", { name: "שמירה" }).click();
  await expect(A.page.getByText("נשמר")).toBeVisible();

  const B = await newUserPage(browser, "cadet4@example.com", "/people");
  await expect(B.page.getByTestId("person-row").filter({ hasText: "נועה כהן" })).toBeVisible();
  await B.page.getByTestId("person-row").filter({ hasText: "נועה כהן" }).click();
  await expect(B.page.getByText("052-7777777")).toBeVisible();
  await expect(B.page.getByText("cadet2@example.com")).toBeVisible();

  // A hides the phone
  await A.page.reload();
  await A.page.getByRole("switch", { name: /הצגת הטלפון שלי/ }).uncheck({ force: true });
  await expect(A.page.getByText("מוסתר מספר הטלפונים")).toBeVisible();
  await B.page.reload();
  await expect(B.page.getByText("052-7777777")).toHaveCount(0);
  await expect(B.page.getByText("cadet2@example.com")).toBeVisible();
  // pending users are not listed
  await B.page.goto("/people");
  await expect(B.page.getByTestId("person-row").filter({ hasText: "חניך חדש" })).toHaveCount(0);
  await A.ctx.close();
  await B.ctx.close();
});

test("developer docs and machine-readable files are public", async ({ request, page }) => {
  for (const p of ["/llms.txt", "/llms-full.txt", "/bahad.d.ts", "/bahad.js", "/bahad.css"]) {
    const r = await request.get(p);
    expect(r.status(), p).toBe(200);
  }
  expect(await (await request.get("/llms-full.txt")).text()).toContain("bahad.data.collection");
  await page.goto("/dev/starter-prompt");
  await expect(page).toHaveURL(/\/dev\/starter-prompt/); // no login needed
  await expect(page.getByRole("button", { name: "העתקה" })).toHaveCount(2);
  // a website, not an installable app
  const mf = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
  expect(mf.status()).not.toBe(200);
});

test("theme switch (user menu) changes the theme and survives a reload", async ({ page }) => {
  await signIn(page, "cadet1@example.com");
  await page.getByRole("button", { name: "תפריט משתמש" }).click();
  await page.getByRole("radio", { name: "כהה" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "תפריט משתמש" }).click();
  await page.getByRole("radio", { name: "אוטומטי" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
});

test("pages work at 360px width without horizontal scrolling", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await ctx.newPage();
  await signIn(page, "cadet1@example.com");
  for (const path of ["/", "/profile", "/people", "/dev", "/dev/api", "/a/laundry", "/admin"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await ctx.close();
});
