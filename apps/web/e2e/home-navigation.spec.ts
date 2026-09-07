import { expect, test } from "@playwright/test";

for (const [width, height] of [[360, 800], [390, 844], [1024, 768], [1440, 900]]) {
  test(`homepage and task navigation at ${width}`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height });
    const mobile = width < 600;
    for (const authenticated of [false, true]) {
      if (authenticated) {
        await page.goto("/login?next=/account");
        const email = `nav-member-${width}@example.test`;
        await page.getByLabel("E-mailadres").fill(email);
        await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click();
        const otp = await request.post("http://127.0.0.1:45391/__test/latest-otp", { data: { email } });
        await page.getByLabel("Inlogcode").fill(String((await otp.json()).token));
        await page.getByRole("button", { name: "Inloggen", exact: true }).click();
        await expect(page).toHaveURL(/\/account$/u);
        await expect(page.getByRole("heading", { name: "Mijn account", exact: true })).toBeVisible();
      }
      for (const route of ["/", "/live"]) {
        await page.goto(route);
        const nav = page.getByRole("navigation", { name: "Hoofdnavigatie" });
        const trigger = nav.getByLabel("Menu openen");
        const details = nav.locator("details");
        const heading = page.getByRole("heading", { level: 1 });
        await expect(heading).toBeVisible();
        const before = await heading.boundingBox();
        if (mobile) {
          await expect(trigger).toBeVisible();
          const box = await trigger.boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
          const brand = await page.getByRole("img", { name: "Logo T.C. Zuid" }).boundingBox();
          expect(box!.x).toBeGreaterThan(brand!.x + brand!.width);
          await trigger.focus();
          await expect(trigger).toBeFocused();
          await page.keyboard.press("Enter");
          await expect(details).toHaveAttribute("open", "");
        } else {
          await expect(trigger).toBeHidden();
        }
        const links = nav.locator("a:visible");
        expect(await links.evaluateAll((items) => items.map((item) => item.getAttribute("href")))).toEqual(
          authenticated ? ["/live", "/tos", "/historie", "/account"] : ["/", "/live", "/login?next=%2Ftos"],
        );
        if (route === "/live") await expect(nav.locator('a[aria-current="page"]:visible')).toHaveAttribute("href", "/live");
        if (mobile) {
          await trigger.click();
          await expect(details).not.toHaveAttribute("open", "");
          await trigger.click();
          await expect(details).toHaveAttribute("open", "");
          await trigger.press("Enter");
          await expect(details).not.toHaveAttribute("open", "");
          expect((await heading.boundingBox())!.y).toBe(before!.y);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: info.outputPath(`${authenticated ? "member" : "anonymous"}-${route === "/" ? "home" : "live"}-${width}.png`) });
      }
    }
  });
}
