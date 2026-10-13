import { expect, test } from "@playwright/test";

for (const width of [360, 390, 1024, 1440]) {
  test(`event and round board clarity ${width}`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const overflow = async () => {
      const measured = await page.evaluate(() => ({
        excess: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        offenders: [...document.querySelectorAll("body *")].filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
          .slice(0, 8).map((element) => `${element.tagName}.${element.className}`),
      }));
      expect(measured.excess, JSON.stringify(measured.offenders)).toBeLessThanOrEqual(1);
    };
    await page.goto("/login?next=%2Ftos");
    const email = `dashboard-web10-clarity-${width}@example.test`;
    await page.getByLabel("E-mailadres").fill(email);
    await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click();
    const otp = await request.post("http://127.0.0.1:45391/__test/latest-otp", { data: { email } });
    await page.getByLabel("Inlogcode").fill(String((await otp.json()).token));
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    await expect(page).toHaveURL(/\/tos$/u);
    for (const [label, route] of [["home", "/"], ["tos", "/tos"], ["board", "/live"], ["personal", "/live/personal-past"]]) {
      await page.goto(route);
      if (label === "home" || label === "tos") {
        const card = page.getByRole("heading", { level: 3 }).first().locator("xpath=ancestor::section[1]");
        if (width < 672) {
          await expect(card.locator("time").first()).toBeHidden();
          await expect(card.locator("time").nth(1)).toBeVisible();
          await expect(card.locator("time").nth(1)).toContainText(/\d{2}:\d{2}–\d{2}:\d{2}/);
        } else {
          await expect(card.locator("time").first()).toBeVisible();
          await expect(card.locator("time").nth(1)).toBeHidden();
        }
        await expect(page.getByText("Vol", { exact: true }).first()).toBeVisible();
      } else if (label === "board") {
        await expect(page.getByLabel("Kies je naam")).toHaveValue("Iedereen");
        await expect(page.getByLabel("Eerste team", { exact: true }).first()).toBeVisible();
        await expect(page.getByLabel("Tweede team", { exact: true }).first()).toBeVisible();
      } else {
        await page.getByLabel("Kies je naam").selectOption("Dezelfde Naam");
        await expect(page.getByRole("article").getByRole("heading", { name: "Kremer Baan" })).toBeVisible();
        await page.getByRole("button", { name: "Bekijk ronde 2", exact: true }).click();
        await expect(page.getByRole("button", { name: "Bekijk ronde 2", exact: true })).toHaveAttribute("aria-pressed", "true");
      }
      await overflow();
      await page.screenshot({ path: info.outputPath(`${label}-${width}.png`), fullPage: true });
      await page.addStyleTag({ content: "html { font-size: 32px; }" });
      await overflow();
      await page.screenshot({ path: info.outputPath(`${label}-zoom-${width}.png`), fullPage: true });
    }
  });
}
