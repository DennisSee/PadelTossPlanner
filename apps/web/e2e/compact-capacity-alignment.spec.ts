import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const mock = "http://127.0.0.1:45391";
const preview = resolve("test-results/WEB-10.10.2-capacity");

for (const width of [360, 390, 1440]) {
  test(`compact home capacity ${width}`, async ({ page, request }) => {
    await request.post(`${mock}/__test/reset-state`);
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    // All fixture updates are confined to the existing local in-memory mock.
    const staff = "planner-capacity@example.test";
    expect((await request.post(`${mock}/auth/v1/otp`, { data: { email: staff, create_user: true } })).ok()).toBe(true);
    const staffOtp = await (await request.post(`${mock}/__test/latest-otp`, { data: { email: staff } })).json();
    const staffSession = await (await request.post(`${mock}/auth/v1/verify`, { data: { email: staff, token: staffOtp.token, type: "email" } })).json();
    const updated = await request.patch(`${mock}/rest/v1/tos_events?id=eq.10000000-0000-4000-8000-000000000001&slug=eq.vrijdag-padel`, {
      headers: { Authorization: `Bearer ${staffSession.access_token}` },
      data: { title: "Padel TOS vrijdagavond", signup_deadline: null, status: "open", max_participants: 4 },
    });
    expect(updated.ok()).toBe(true);
    await page.goto("/login?next=%2Ftos");
    const email = `dashboard-web10-capacity-${width}@example.test`;
    await page.getByLabel("E-mailadres").fill(email);
    await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click();
    const otp = await (await request.post(`${mock}/__test/latest-otp`, { data: { email } })).json();
    await page.getByLabel("Inlogcode").fill(String(otp.token));
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    await expect(page).toHaveURL(/\/tos$/u);
    await page.goto("/");
    const panels = page.locator('[class*="capacityHomeGroup"]');
    for (const [total, waiting] of [["4 / 4", null], ["2 / 2", "1 op wachtlijst"]] as const) {
      const panel = panels.filter({ has: page.getByText(total, { exact: true }) });
      const number = panel.getByText(total, { exact: true });
      const full = panel.getByText("Vol", { exact: true });
      await expect(number).toBeVisible();
      await expect(full).toBeVisible();
      expect((await number.boundingBox())!.y).toBeLessThan((await full.boundingBox())!.y + 10);
      expect((await full.boundingBox())!.x).toBeGreaterThan((await number.boundingBox())!.x);
      if (waiting) {
        const caption = (await panel.getByText("Plekken bezet").boundingBox())!;
        const wait = (await panel.getByText(waiting).boundingBox())!;
        expect(Math.abs(wait.x - caption.x)).toBeLessThan(1);
        expect(wait.y).toBeGreaterThan(caption.y);
      } else await expect(panel.getByText(/op wachtlijst/)).toHaveCount(0);
    }
    const overflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await overflow();
    await mkdir(preview, { recursive: true });
    await page.screenshot({ path: resolve(preview, `home-capacity-${width}.png`), fullPage: true });
    await page.addStyleTag({ content: "html { font-size: 32px; }" });
    await overflow();
    await page.screenshot({ path: resolve(preview, `home-capacity-200-${width}.png`), fullPage: true });
    await request.post(`${mock}/__test/reset-state`);
  });
}
