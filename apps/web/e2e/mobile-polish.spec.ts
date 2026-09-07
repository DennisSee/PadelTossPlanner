import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

const mock = "http://127.0.0.1:45391";
async function signIn(page: Page, request: APIRequestContext, email: string) {
  await page.context().clearCookies();
  await page.goto("/login?next=/account");
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click();
  const otp = await request.post(`${mock}/__test/latest-otp`, { data: { email } });
  await page.getByLabel("Inlogcode").fill(String((await otp.json()).token));
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/u);
  await expect(page.getByRole("heading", { level: 1, name: "Mijn account" })).toBeVisible();
}

test.afterEach(async ({ request }) => { await request.post(`${mock}/__test/reset-state`); });

test("mobile polish route density and responsive matrix", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  // Each project exercises the entire required matrix without additional skips.
  for (const [width, height] of [[360, 800], [390, 844], [1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await signIn(page, request, `dashboard-polish-${width}@example.test`);
    for (const [index, route] of ["/", "/tos", "/tos/vrijdag-padel", "/account", "/historie?tab=events", "/historie?tab=clubmates", "/live", "/live/personal-live", "/live/personal-past"].entries()) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const box = element.getBoundingClientRect();
          return { y: Math.round(box.y), height: Math.round(box.height) };
        };
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          hero: rect('header[class*="pageHeader"], section[class*="intro"]'),
          account: rect('section[class*="contentCard"]'),
          registration: rect('section[class*="formCard"]'),
          event: rect('details[class*="eventCard"]'),
          clubmate: rect('section[class*="clubmateCard"]'),
          firstAction: [...document.querySelectorAll('main section a, main section button, main [role="tab"], main summary')]
            .filter((element) => !element.closest('nav, dialog'))
            .map((element) => element.getBoundingClientRect())
            .filter((box) => box.width >= 44 && box.height >= 44)
            .sort((a, b) => a.y - b.y)
            .map((box) => ({ y: Math.round(box.y), height: Math.round(box.height) }))[0] ?? null,
        };
      });
      console.log(JSON.stringify({ width, route, ...metrics }));
      expect(metrics.overflow, route).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`route-${index}-${width}.png`), fullPage: true });
      if (route === "/historie?tab=clubmates") {
        const row = page.getByRole("button", { name: "Bekijk gedeelde historie" });
        expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await row.click();
        await expect(page.getByRole("dialog", { name: "Ready Hele Avond" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(row).toBeFocused();
        await page.getByRole("tab", { name: "Clubgenoten" }).focus();
        await page.keyboard.press("Home");
        await expect(page.getByRole("tab", { name: "Avonden" })).toHaveAttribute("aria-selected", "true");
        await page.keyboard.press("End");
        await expect(page.getByRole("tab", { name: "Clubgenoten" })).toBeFocused();
      }
      if (route === "/tos/vrijdag-padel") {
        const yes = page.getByRole("radio", { name: "Ik doe mee", exact: true });
        await yes.focus();
        await page.keyboard.press("ArrowRight");
        await expect(page.getByRole("radio", { name: "Ik doe niet mee" })).toBeChecked();
        await expect(page.getByLabel("Vanaf")).toBeHidden();
        await page.keyboard.press("ArrowLeft");
        await expect(yes).toBeChecked();
        const from = await page.getByLabel("Vanaf").boundingBox();
        const until = await page.getByLabel("Tot").boundingBox();
        expect(from!.height).toBeGreaterThanOrEqual(44);
        expect(from!.y).toBe(until!.y);
      }
    }
    await signIn(page, request, `planner-polish-${width}@example.test`);
    await request.post(`${mock}/__test/planner-best-effort-fixture`);
    await page.goto("/beheer/tos/web5b1-padel");
    await page.getByRole("button", { name: "Schema genereren", exact: true }).click();
    await expect(page.getByText("Planningkwaliteit", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`planner-${width}.png`), fullPage: true });
    await page.getByLabel("Kwaliteit van het schema").screenshot({ path: info.outputPath(`quality-${width}.png`) });
  }
});

test("compact controls survive keyboard, long text and 200 percent text zoom", async ({ page, request }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, request, "dashboard-zoom@example.test");
  for (const route of ["/", "/tos", "/tos/vrijdag-padel", "/account", "/historie?tab=clubmates", "/live/personal-live"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Synthetic presentation-only stress content; never submitted as application data.
    await page.evaluate(() => {
      for (const element of document.querySelectorAll('[class*="identityName"], [class*="clubmateCopy"] h3, [class*="eventTitle"]')) {
        element.textContent = "Alexandria van den Berg-van der Meer met een bijzonder lange Nederlandse naam";
      }
    });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("32px");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe("32px");
    const clippedControls = await page.evaluate(() => [...document.querySelectorAll('main button, main input, main select, main h1, main h2, main h3, main [class*="roundTime"]')]
      .filter((element) => !element.closest('dialog, [hidden], details:not([open])'))
      .filter((element) => { const box = element.getBoundingClientRect(); return box.width > 0 && box.right > document.documentElement.clientWidth + 1; })
      .map((element) => element.textContent));
    expect(clippedControls, route).toEqual([]);
    const overlappingCapacity = await page.evaluate(() => [...document.querySelectorAll('[class*="capacityNumbers"]')].some((element) => {
      const count = element.getBoundingClientRect();
      const free = element.parentElement?.querySelector("p")?.getBoundingClientRect();
      return free && count.width > 0 && count.left < free.right && free.left < count.right && count.top < free.bottom && free.top < count.bottom;
    }));
    expect(overlappingCapacity, route).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), route).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`zoom-${route.replace(/[^a-z]/gu, "-")}.png`), fullPage: true });
    if (route === "/account") {
      await page.getByRole("button", { name: /Zichtbare naam wijzigen/u }).click();
      const dialog = page.getByRole("dialog", { name: "Zichtbare naam wijzigen" });
      await expect(dialog.getByLabel("Zichtbare naam")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  }
});

test("participant states retain truthful actions and current-only live emphasis", async ({ page, request }, info) => {
  for (const state of ["live", "waitlist", "empty"] as const) {
    const email = `polish-state-${state}@example.test`;
    await request.post(`${mock}/__test/home-state`, { data: { email, state } });
    await signIn(page, request, email);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`home-${state}.png`), fullPage: true });
  }
  await signIn(page, request, "empty-history-polish@example.test");
  await page.goto("/historie");
  await expect(page.getByRole("heading", { name: "Nog geen TOS-historie" })).toBeVisible();
  for (const email of ["live-member-polish@example.test", "live-member-rest@example.test"]) {
    await signIn(page, request, email);
    await page.goto("/live/personal-live");
    const current = page.getByRole("article", { name: /^Nu:/u });
    await expect(current).toHaveClass(/personalFocusCurrent/u);
    await expect(page.getByRole("article", { name: /^Hierna:/u })).not.toHaveClass(/personalFocusCurrent/u);
    await page.screenshot({ path: info.outputPath(`personal-${email}.png`), fullPage: true });
    await page.goto("/live/personal-past");
    await expect(page.getByRole("article", { name: /^Nu:/u })).toHaveCount(0);
    await expect(page.getByText(/Er is nu geen TOS bezig/u)).toBeVisible();
  }
  await signIn(page, request, "admin-polish@example.test");
  await expect(page.getByLabel("Accountmogelijkheden")).toContainText("Admin");
  await page.screenshot({ path: info.outputPath("account-admin.png"), fullPage: true });
});
