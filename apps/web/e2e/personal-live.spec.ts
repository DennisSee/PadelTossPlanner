import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

const mock = "http://127.0.0.1:45391";
async function signIn(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/login?next=/account");
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click();
  const otp = await request.post(`${mock}/__test/latest-otp`, { data: { email } });
  await page.getByLabel("Inlogcode").fill(String((await otp.json()).token));
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/u);
  await expect(page.getByRole("heading", { level: 1, name: "Mijn account" })).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

test.beforeEach(async ({}, info) => { test.skip(info.project.name !== "desktop-1440", "Deze matrix test zelf de vier vereiste viewports."); });
test.afterEach(async ({ request }) => { await request.post(`${mock}/__test/reset-state`); });

for (const [width, height] of [[360, 800], [390, 844], [1024, 768], [1440, 900]]) {
  test(`personal live and visual task matrix ${width}`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height });
    await signIn(page, request, `live-member-${width}@example.test`);
    await page.goto("/live/personal-live");
    await expect(page.getByLabel("Schema voor")).toHaveValue("a4600000-0000-4000-8000-000000000002");
    const current = page.getByRole("article", { name: "Nu: Kremer Baan" });
    await expect(current).toContainText("Samen metDezelfde Naam");
    await expect(current).toContainText("Speler 2 & Speler 3");
    await expect(page.getByRole("article", { name: "Hierna: Kremer Baan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Volledig schema" })).toBeVisible();
    if (width < 672) await expect(page.getByRole("link", { name: "Mijn live-schema" })).toBeVisible();
    const box = await current.boundingBox();
    expect(box?.y).toBeLessThan(height);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`personal-${width}.png`), fullPage: true });
    await page.getByLabel("Schema voor").selectOption("");
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Volledig schema" })).toBeVisible();
    const routes = ["/", "/live", "/live/personal-past", "/live/personal-future", "/historie", "/account", "/tos/vrijdag-padel"];
    for (const [i, route] of routes.entries()) {
      await page.goto(route);
      if (route === "/live") await expect(page).toHaveURL(/\/live\/live-schema$/u);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noOverflow(page);
      if (route.includes("personal-past") || route.includes("personal-future")) {
        await expect(page.getByText(/Er is nu geen TOS bezig/)).toBeVisible();
        await expect(page.getByRole("link", { name: "Mijn live-schema" })).toHaveCount(0);
      }
      await page.screenshot({ path: info.outputPath(`route-${i}-${width}.png`), fullPage: true });
    }
    console.log(JSON.stringify({ viewport: width, firstPersonalActionY: box?.y }));
    await page.context().clearCookies();
    await signIn(page, request, `planner-visual-${width}@example.test`);
    await page.goto("/beheer/tos/web5b1-padel");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`planner-${width}.png`), fullPage: true });
  });
}
test("rest participant and anonymous/no-mapping fallback", async ({ page, request }) => {
  await page.goto("/live/personal-live");
  await expect(page.getByLabel("Schema voor")).toHaveCount(0);
  await expect(page.getByLabel("Kies je naam")).toBeVisible();
  await signIn(page, request, "live-member-rest@example.test");
  await page.goto("/live/personal-live");
  await expect(page.getByRole("article", { name: "Nu: Rust" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Hierna: Rust" })).toBeVisible();
});
