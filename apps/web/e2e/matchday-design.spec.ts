import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const preview = resolve("test-results/WEB-10.10-preview-final");
for (const [width, height] of [[360, 800], [390, 844], [1024, 768], [1440, 900]]) {
  test(`approved Matchday presentation ${width}`, async ({ page, request }) => {
    await mkdir(preview, { recursive: true });
    await page.setViewportSize({ width, height });
    const shot = async (name: string) => page.screenshot({ path: resolve(preview, `${name}-${width}.png`), fullPage: true });
    const overflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.goto("/login?next=%2Ftos");
    const email = `dashboard-web10-matchday-${width}@example.test`;
    await page.getByLabel("E-mailadres").fill(email);
    await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click();
    const otp = await request.post("http://127.0.0.1:45391/__test/latest-otp", { data: { email } });
    await page.getByLabel("Inlogcode").fill(String((await otp.json()).token));
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    await expect(page).toHaveURL(/\/tos$/u);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Jouw inschrijvingen", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jouw TOS-momenten staan klaar");
    await expect(page.locator('[class*="heroCue"]')).toHaveCount(0);
    await expect(page.getByText("Vol", { exact: true })).toBeVisible();
    await expect(page.locator('[class*="eventCardCompact"] [class*="capacityPanel"]').getByText(/plekken vrij/)).toHaveCount(0);
    const deadline = page.locator('[class*="deadline"] time').first();
    await expect(deadline).toContainText(/Inschrijven tot \d{1,2} \S+ \d{4} · \d{2}:\d{2}/u);
    await expect(deadline).toHaveAttribute("datetime", /T/u);
    const homeHeroHeight = (await page.getByRole("heading", { level: 1 }).locator("xpath=ancestor::section[1]").boundingBox())!.height;
    const homeCardHeights = await page.locator('[class*="eventCardCompact"]').evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().height * 100) / 100));
    if (width <= 390) {
      const firstCard = page.locator('[class*="eventCardCompact"]').first();
      await expect(firstCard.locator('time').first()).toBeVisible();
      await expect(firstCard.locator('[class*="mobileDate"]')).toBeHidden();
      expect((await firstCard.getByRole("link", { name: "Mijn aanmelding", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await overflow();
    await shot("home");
    await page.addStyleTag({ content: "html { font-size: 32px; }" });
    await overflow();
    await shot("home-text-200");
    await page.reload();
    await page.getByRole("button", { name: /Bekijk deelnemers/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Sluiten", exact: true }).last().click();
    await page.goto("/tos");
    await overflow();
    await shot("tos");
    await page.goto("/live");
    await expect(page.getByLabel("Kies je naam")).toHaveValue("Iedereen");
    await expect(page.getByRole("status").filter({ hasText: "Nu bezig" })).toBeVisible();
    const second = page.getByRole("button", { name: "Bekijk ronde 2", exact: true });
    await second.focus();
    await page.keyboard.press("Enter");
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await expect(second).toBeFocused();
    expect((await second.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "Alle rondes", exact: true }).click();
    await expect(page.locator("[data-round-number]")).toHaveCount(2);
    await page.getByRole("button", { name: "Bekijk ronde 1", exact: true }).click();
    const firstMatch = page.locator('[class*="boardMatch"]').filter({ has: page.getByTestId("court-badge") }).first();
    if (width === 390 || width === 360) expect((await firstMatch.boundingBox())!.y).toBeLessThan(450);
    const court = firstMatch.getByTestId("court-badge");
    await expect(page.getByTestId("event-summary").locator('svg[aria-hidden="true"]')).toHaveCount(4);
    const versus = firstMatch.getByText("VS", { exact: true });
    expect(await versus.evaluate((node) => getComputedStyle(node, "::before").content)).toBe('""');
    expect(await versus.evaluate((node) => getComputedStyle(node, "::after").content)).toBe('""');
    if (width <= 390) {
      const cardBox = (await firstMatch.boundingBox())!;
      const vsBox = (await versus.boundingBox())!;
      expect(Math.abs(vsBox.x + vsBox.width / 2 - cardBox.x - cardBox.width / 2)).toBeLessThan(1);
      const rowCenters = await firstMatch.locator('[class*="boardTeamColumn"]').evaluateAll((teams) => teams.map((team) =>
        Array.from(team.querySelectorAll('[class*="teamNamePart"]')).map((row) => { const box = row.getBoundingClientRect(); return box.y + box.height / 2; })));
      for (let row = 0; row < 2; row++) expect(Math.abs(rowCenters[0][row] - rowCenters[1][row])).toBeLessThan(1);
    }
    await expect(court).toHaveAttribute("title", /Seppworks\/Bax/);
    const courtText = court.locator("span").last();
    expect(await courtText.evaluate((node) => node.getBoundingClientRect().height <= parseFloat(getComputedStyle(node).lineHeight) + 1)).toBe(true);
    if (width <= 390) expect(await court.locator("span").last().evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await writeFile(resolve(preview, `metrics-${width}.json`), JSON.stringify({ width, height, homeHeroHeight, homeCardHeights, firstMatch: await firstMatch.boundingBox() }, null, 2));
    await overflow();
    await shot("live-general");
    await page.addStyleTag({ content: "html { font-size: 32px; }" });
    await overflow();
    await shot("live-general-text-200");
    await page.reload();
    await page.getByLabel("Kies je naam").selectOption("Zoë Accent");
    await expect(page.locator("[data-personal-detail]").getByText("Nu spelen")).toBeVisible();
    await expect(page.locator("[data-personal-detail]").getByText("Spelen", { exact: true })).toHaveCount(0);
    await writeFile(resolve(preview, `personal-metrics-${width}.json`), JSON.stringify(await page.locator('[data-personal-detail] article').boundingBox(), null, 2));
    expect(await page.locator('[class*="compactNext"]').evaluate((node) => getComputedStyle(node).borderLeftWidth)).toBe("0px");
    const personalVersus = page.locator("[data-personal-detail]").getByText("VS", { exact: true });
    await expect(page.locator("[data-personal-detail]").getByText("Samen met", { exact: true })).toHaveClass("sr-only");
    const personalBox = (await page.locator('[data-personal-detail] dl').boundingBox())!;
    const personalVsBox = (await personalVersus.boundingBox())!;
    expect(Math.abs(personalVsBox.x + personalVsBox.width / 2 - personalBox.x - personalBox.width / 2)).toBeLessThan(1);
    expect(await personalVersus.evaluate((node) => getComputedStyle(node, "::before").content)).toBe('""');
    await overflow();
    await shot("live-active");
    await page.getByLabel("Kies je naam").selectOption("Rust Speler");
    await expect(page.locator("[data-personal-detail]").getByText("Nu rust")).toBeVisible();
    await expect(page.locator("[data-personal-detail]").getByText("Rust", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Bekijk ronde 1", exact: true }).getByText("Rust", { exact: true })).toHaveCount(1);
    await shot("live-rest");
    for (const slug of ["personal-past", "personal-future"]) {
      await page.goto(`/live/${slug}`);
      await page.getByLabel("Kies je naam").selectOption("Dezelfde Naam");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jouw schema");
      await expect(page.getByRole("heading", { level: 1 })).toHaveAttribute("title", "Persoonlijke TOS");
      const selected = page.getByRole("button", { name: "Selecteer ronde 2", exact: true });
      await selected.click();
      await expect(selected).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("[data-personal-detail]").getByRole("heading", { name: "Kremer Baan" })).toBeVisible();
      await expect(page.getByText("Nu spelen", { exact: true })).toHaveCount(0);
      await overflow();
      await shot(slug === "personal-past" ? "live-personal-past" : "live-personal-future");
      if (slug === "personal-past") {
        await page.addStyleTag({ content: "html { font-size: 32px; }" });
        await overflow();
        await shot("live-personal-text-200");
        await page.reload();
      }
      await page.getByLabel("Kies je naam").selectOption("Iedereen");
      await page.getByRole("button", { name: "Alle rondes", exact: true }).click();
      await expect(page.getByText(/Nu bezig/)).toHaveCount(0);
      await shot(slug === "personal-past" ? "live-general-past" : "live-general-future");
    }
  });
}
