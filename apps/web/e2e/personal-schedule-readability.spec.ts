import { expect, test } from "@playwright/test";

for (const width of [360, 390, 1024, 1440]) {
  test(`personal schedule detail and round selection ${width}`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const overflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.goto("/live");
    await page.getByLabel("Kies je naam").selectOption("Zoë Accent");
    const current = page.locator("[data-personal-detail]");
    await expect(current.getByText("Nu spelen")).toBeVisible();
    await expect(current.getByRole("heading", { name: /Seppworks\/Bax/ })).toBeVisible();
    await expect(current.getByText("Samen met")).toBeVisible();
    await expect(page.getByRole("region", { name: "Volgende ronde" }).getByRole("button")).toBeVisible();
    await overflow();
    await page.screenshot({ path: info.outputPath(`active-${width}.png`), fullPage: true });
    await page.getByLabel("Kies je naam").selectOption("Rust Speler");
    await expect(current.getByText("Nu rust")).toBeVisible();
    await expect(current.getByText("BAAN")).toHaveCount(0);

    for (const slug of ["personal-past", "personal-future"]) {
      await page.goto(`/live/${slug}`);
      await page.getByLabel("Kies je naam").selectOption("Dezelfde Naam");
      await expect(current.getByRole("heading", { name: "Kremer Baan" })).toBeVisible();
      await expect(current.getByRole("heading", { name: "Ronde 1" })).toBeVisible();
      await expect(current.getByText("Dezelfde Naam", { exact: true }).last()).toBeVisible();
      await expect(page.getByText("Nu spelen")).toHaveCount(0);
      if (slug === "personal-past") await expect(page.getByTestId("event-status")).toHaveText("Afgelopen");
      const second = page.getByRole("button", { name: "Bekijk ronde 2", exact: true });
      await second.focus();
      await page.keyboard.press("Enter");
      await expect(second).toHaveAttribute("aria-pressed", "true");
      await expect(second).toBeFocused();
      expect((await second.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await expect(current.getByRole("heading", { name: "Ronde 2" })).toBeVisible();
      await overflow();
      await page.screenshot({ path: info.outputPath(`${slug}-${width}.png`), fullPage: true });
      await page.getByLabel("Kies je naam").selectOption("Iedereen");
      await expect(page.getByRole("button", { name: "Bekijk ronde 2", exact: true })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Ronde 1" })).toBeVisible();
    }
    await page.goto("/login?next=%2Faccount");
    const email = `live-member-readability-${width}@example.test`;
    await page.getByLabel("E-mailadres").fill(email);
    await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click();
    const otp = await request.post("http://127.0.0.1:45391/__test/latest-otp", { data: { email } });
    await page.getByLabel("Inlogcode").fill(String((await otp.json()).token));
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    await expect(page).toHaveURL(/\/account$/u);
    await page.goto("/live/personal-live");
    await expect(page.getByLabel("Schema voor")).toHaveValue("a4600000-0000-4000-8000-000000000002");
    await expect(current.getByText("Nu spelen")).toBeVisible();
    await page.getByRole("button", { name: "Bekijk ronde 2", exact: true }).click();
    await expect(current.getByText("Nu spelen")).toHaveCount(0);
    await expect(current.getByRole("heading", { name: "Ronde 2" })).toBeVisible();
    await overflow();
    await page.screenshot({ path: info.outputPath(`identity-${width}.png`), fullPage: true });
  });
}
