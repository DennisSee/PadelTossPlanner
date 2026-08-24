import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const VIEWPORTS = new Set(["phone-390", "desktop-1440"]);
const MOCK_URL = "http://127.0.0.1:45391";

test.beforeEach(async ({}, testInfo) => {
  test.skip(!VIEWPORTS.has(testInfo.project.name), "WEB-8 draait gericht op 390px en 1440px.");
});
test.afterEach(async ({ request }) => {
  expect((await request.post(`${MOCK_URL}/__test/reset-state`)).ok()).toBe(true);
});

function email(prefix: string) { return `${prefix}-${randomUUID()}@example.test`; }
async function latestOtp(request: APIRequestContext, address: string) {
  const response = await request.post(`${MOCK_URL}/__test/latest-otp`, { data: { email: address } });
  expect(response.ok()).toBe(true);
  return String((await response.json()).token);
}
async function signIn(page: Page, request: APIRequestContext, address: string) {
  await page.getByLabel("E-mailadres").fill(address);
  await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click();
  await page.getByLabel("Inlogcode").fill(await latestOtp(request, address));
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
}
async function assertNoOverflow(page: Page) {
  const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
}

test("admin deletes a TOS event only after an explicit safe confirmation", async ({ page, request }) => {
  await page.goto("/login?next=/beheer");
  await signIn(page, request, email("admin-no-member"));
  const title = `Te verwijderen TOS ${randomUUID().slice(0, 6)}`;
  const createSummary = page.locator("details summary").filter({ hasText: "Nieuwe TOS" }).first();
  const createDisclosure = createSummary.locator("xpath=ancestor::details[1]");
  if ((await createDisclosure.getAttribute("open")) === null) await createSummary.click();
  await page.getByLabel("Titel").first().fill(title);
  await page.getByRole("button", { name: "TOS-avond aanmaken" }).click();
  const card = page.getByRole("heading", { name: title, exact: true }).locator("xpath=ancestor::section[1]");
  await card.getByRole("button", { name: "TOS-avond verwijderen" }).click();
  const dialog = page.getByRole("dialog", { name: "TOS-avond definitief verwijderen?" });
  await expect(dialog.getByRole("button", { name: "Annuleren" })).toBeFocused();
  await dialog.getByRole("button", { name: "Annuleren" }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await card.getByRole("button", { name: "TOS-avond verwijderen" }).click();
  await dialog.getByRole("button", { name: "Definitief verwijderen" }).click();
  await expect(page).toHaveURL(/\/beheer\?notice=event-deleted$/u);
  await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("bijbehorende gegevens zijn verwijderd");
  await assertNoOverflow(page);
});

test("admin deletes another member account while planner cannot see destructive controls", async ({ page, request }, testInfo) => {
  const targetEmail = email("web8-delete-target");
  const fixture = await request.post(`${MOCK_URL}/auth/v1/otp`, { data: { email: targetEmail, create_user: true } });
  expect(fixture.ok()).toBe(true);

  await page.goto("/login?next=/beheer/leden");
  await signIn(page, request, email("planner-no-member"));
  await expect(page).toHaveURL(/\/beheer\/leden$/u);
  await page.getByLabel("Zoeken op naam of e-mailadres").fill(targetEmail);
  await expect(page.getByRole("button", { name: "Lid verwijderen" })).toHaveCount(0);
  await page.context().clearCookies();

  await page.goto("/login?next=/beheer/leden");
  await signIn(page, request, email("admin-no-member"));
  await expect(page).toHaveURL(/\/beheer\/leden$/u);
  await page.getByLabel("Zoeken op naam of e-mailadres").fill(targetEmail);
  const openMember = async () => {
    if (testInfo.project.name === "phone-390") {
      await page.locator("button[class*='mobileMember']").filter({ hasText: targetEmail }).click();
    } else {
      await page.locator("tbody tr").filter({ hasText: targetEmail }).getByRole("button", { name: /Details van/u }).click();
    }
  };
  await openMember();
  const editor = page.getByRole("dialog", { name: /bewerken/u });
  await editor.getByRole("button", { name: "Lid verwijderen" }).click();
  const dialog = page.getByRole("dialog", { name: "Lid verwijderen", exact: true });
  await expect(dialog).toContainText(targetEmail);
  await dialog.getByRole("button", { name: "Annuleren" }).click();
  await expect(page.locator(`[title="${targetEmail}"]:visible`)).toHaveCount(1);
  await openMember();
  await editor.getByRole("button", { name: "Lid verwijderen" }).click();
  await dialog.getByRole("button", { name: "Lid verwijderen" }).click();
  await expect(page.getByRole("status")).toContainText("Lid verwijderd");
  await expect(page.getByText(targetEmail, { exact: true })).toHaveCount(0);
  await assertNoOverflow(page);
});
