import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

const mock = "http://127.0.0.1:45391";

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop-1440", "Deze gerichte matrix stelt zelf de vier gevraagde schermbreedtes in.");
});

async function signIn(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/login?next=%2Faccount");
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click();
  const otp = await request.post(`${mock}/__test/latest-otp`, { data: { email } });
  await page.getByLabel("Inlogcode").fill(String((await otp.json()).token));
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/u);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

test.afterEach(async ({ request }) => { await request.post(`${mock}/__test/reset-state`); });

for (const width of [360, 390, 1024, 1440]) {
  test(`home and live refresh visual review ${width}`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    const email = `live-member-refresh-${width}@example.test`;
    expect((await request.post(`${mock}/__test/home-state`, { data: { email, state: "multiple-placed" } })).ok()).toBe(true);
    await signIn(page, request, email);
    await page.goto("/");
    const enrolled = page.getByRole("region", { name: "Jouw inschrijvingen" });
    await expect(enrolled.getByRole("heading", { level: 3 })).toHaveCount(2);
    await expect(enrolled.getByText("✓ Je bent geplaatst")).toHaveCount(2);
    await expect(page.getByRole("region", { name: "Andere open TOS-momenten" }).getByRole("heading", { level: 3 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
    const hero = page.getByRole("link", { name: "Bekijk je inschrijvingen" });
    await hero.focus();
    await expect(hero).toBeFocused();
    expect((await hero.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`home-${width}.png`), fullPage: true });

    await page.goto("/live/personal-live");
    await expect(page.getByLabel("Schema voor")).toHaveValue("a4600000-0000-4000-8000-000000000002");
    const current = page.getByRole("article", { name: "Nu: Kremer Baan" });
    await expect(current.getByText("Nu spelen")).toBeVisible();
    await expect(current.getByRole("heading", { name: "Kremer Baan" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Hierna: Kremer Baan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Volledig schema" })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`live-${width}.png`), fullPage: true });
    await page.getByLabel("Schema voor").selectOption("a4600000-0000-4000-8000-000000000005");
    await expect(page.getByRole("article", { name: "Nu: Rust" }).getByText("Nu rust")).toBeVisible();
    await expect(page.getByRole("article", { name: "Nu: Rust" }).getByText("BAAN")).toHaveCount(0);
    await noOverflow(page);

    for (const slug of ["personal-past", "personal-future"]) {
      await page.goto(`/live/${slug}`);
      await expect(page.getByLabel("Kies je naam")).toBeVisible();
      await expect(page.getByText("Nu spelen", { exact: true })).toHaveCount(0);
      if (slug === "personal-past") await expect(page.getByTestId("event-status")).toHaveText("Afgelopen");
      await noOverflow(page);
    }
    await page.context().clearCookies();
    await page.goto("/live");
    await page.getByLabel("Kies je naam").selectOption("Zoë Accent");
    await expect(page.getByRole("region", { name: "Huidige ronde" }).getByText("Nu spelen")).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`manual-live-${width}.png`), fullPage: true });
    await page.addStyleTag({ content: "html { font-size: 20px; }" });
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`zoom-live-${width}.png`), fullPage: true });
  });
}
