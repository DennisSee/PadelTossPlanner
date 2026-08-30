import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const VIEWPORTS = new Set(["phone-360", "phone-390", "desktop-1440"]);
const MOCK_URL = "http://127.0.0.1:45391";

test.beforeEach(async ({}, testInfo) => {
  test.skip(!VIEWPORTS.has(testInfo.project.name), "WEB-10.1 controleert 360px, 390px en 1440px.");
});
test.afterEach(async ({ request }) => {
  expect((await request.post(`${MOCK_URL}/__test/reset-state`)).ok()).toBe(true);
});

async function latestOtp(request: APIRequestContext, email: string) {
  const response = await request.post(`${MOCK_URL}/__test/latest-otp`, { data: { email } });
  expect(response.ok()).toBe(true);
  return String((await response.json()).token);
}

async function signInAsAdmin(page: Page, request: APIRequestContext) {
  const email = `admin-no-member-${randomUUID()}@example.test`;
  await page.goto("/login?next=/beheer/leden");
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click();
  await page.getByLabel("Inlogcode").fill(await latestOtp(request, email));
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  await expect(page).toHaveURL(/\/beheer\/leden$/u);
}

async function noHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
}

test("desktop stages inline sport and role edits and saves once", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Desktop datagridflow.");
  const roleTargetEmail = `role-target-${randomUUID()}@example.test`;
  expect((await request.post(`${MOCK_URL}/auth/v1/otp`, { data: { email: roleTargetEmail, create_user: true } })).ok()).toBe(true);
  await signInAsAdmin(page, request);
  await expect(page.getByRole("table")).toBeVisible();
  expect(await page.locator("tbody tr").count()).toBeGreaterThanOrEqual(9);

  await page.getByLabel("Padelniveau voor Ready Partieel").selectOption("2");
  await page.getByLabel("Tennisprofiel voor Ready Partieel").selectOption("true");
  await page.getByLabel("Tennisniveau voor Ready Partieel").selectOption("5");
  await page.getByLabel("Padelniveau voor Niveau Ontbreekt").selectOption("4");
  const roleTargetRow = page.getByRole("row").filter({ hasText: roleTargetEmail });
  await expect(roleTargetRow).toHaveCount(1);
  await roleTargetRow.getByLabel("Accountrol voor Testlid").selectOption("planner");

  const saveBar = page.getByRole("region", { name: "Niet-opgeslagen wijzigingen" });
  await expect(saveBar).toContainText("3 leden gewijzigd");
  await saveBar.getByRole("button", { name: "3 wijzigingen opslaan" }).click();
  await expect(page.getByRole("status")).toContainText("Wijzigingen opgeslagen");
  await expect(saveBar).toHaveCount(0);
  await expect(page.getByLabel("Tennisniveau voor Ready Partieel")).toHaveValue("5");
  await expect(roleTargetRow.getByLabel("Accountrol voor Testlid")).toHaveValue("planner");
  await noHorizontalOverflow(page);
});

test("mobile stages two members in bottom sheets and keeps one global safe-area savebar", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-1440", "Mobiele ledenlijstflow.");
  await signInAsAdmin(page, request);
  await expect(page.getByRole("table")).toBeHidden();
  const mobileRows = page.locator("button[class*='mobileMember']");
  await expect(mobileRows).toHaveCount(8);

  await mobileRows.filter({ hasText: "Ready Partieel" }).click();
  let sheet = page.getByRole("dialog", { name: "Ready Partieel bewerken" });
  const padel = sheet.locator("section").filter({ hasText: "Padel" }).first();
  await padel.getByLabel("Niveau").selectOption("2");
  await sheet.getByRole("button", { name: "Wijzigingen toepassen" }).click();

  await mobileRows.filter({ hasText: "Niveau Ontbreekt" }).click();
  sheet = page.getByRole("dialog", { name: "Niveau Ontbreekt bewerken" });
  const tennis = sheet.locator("section").filter({ hasText: "Tennis" }).first();
  await tennis.getByLabel("Profiel").selectOption("true");
  await tennis.getByLabel("Niveau").selectOption("3");
  await sheet.getByRole("button", { name: "Wijzigingen toepassen" }).click();

  const saveBar = page.getByRole("region", { name: "Niet-opgeslagen wijzigingen" });
  await expect(saveBar).toContainText("2 leden gewijzigd");
  await saveBar.getByRole("button", { name: "2 wijzigingen opslaan" }).click();
  await expect(page.getByRole("status")).toContainText("Wijzigingen opgeslagen");
  await expect(saveBar).toHaveCount(0);
  await noHorizontalOverflow(page);
});
