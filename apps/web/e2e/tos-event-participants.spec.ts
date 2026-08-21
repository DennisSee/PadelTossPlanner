import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const VIEWPORTS = new Set(["phone-390", "desktop-1440"]);
const MOCK_URL = "http://127.0.0.1:45391";

test.beforeEach(async ({}, testInfo) => {
  test.skip(!VIEWPORTS.has(testInfo.project.name), "WEB-5B1 draait gericht op 390px en 1440px.");
});

test.afterEach(async ({ request }) => {
  const response = await request.post(`${MOCK_URL}/__test/reset-state`);
  expect(response.ok()).toBe(true);
});

function email(prefix: string) {
  return `${prefix}-${randomUUID()}@example.test`;
}

async function latestOtp(request: APIRequestContext, address: string): Promise<string> {
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

test("protects the nested participant detail without adding a nested auth return", async ({ page, request }) => {
  await page.goto("/beheer/tos/web5b1-padel");
  await expect(page).toHaveURL(/\/login\?next=%2Fbeheer$/u);

  await signIn(page, request, email("participant"));
  await expect(page).toHaveURL(/\/tos$/u);
  await page.goto("/beheer/tos/web5b1-padel");
  await expect(page).toHaveURL(/\/account$/u);
  await expect(page.getByRole("heading", { name: "WEB-5B1 Padelavond" })).toHaveCount(0);
});

test("planner without membership sees event-scoped padel readiness and preview", async ({ page, request }) => {
  await page.goto("/login?next=/beheer");
  await signIn(page, request, email("planner-no-member"));
  const card = page.getByRole("heading", { name: "WEB-5B1 Padelavond" }).locator("xpath=ancestor::section[1]");
  await expect(card.getByRole("link", { name: "Deelnemers bekijken" }))
    .toHaveAttribute("href", "/beheer/tos/web5b1-padel");
  await card.getByRole("link", { name: "Deelnemers bekijken" }).click();
  await expect(page).toHaveURL(/\/beheer\/tos\/web5b1-padel$/u);

  await expect(page.getByRole("heading", { name: "WEB-5B1 Padelavond" })).toBeVisible();
  await expect(page.getByText("Ready Partieel").first()).toBeVisible();
  await expect(page.getByText("20:07–21:43").first()).toBeVisible();
  await expect(page.getByText("Afgemelde Speler")).toBeVisible();
  await expect(page.getByText("Goedkeuring in behandeling")).toBeVisible();
  await expect(page.getByText("Lidmaatschap niet goedgekeurd")).toBeVisible();
  await expect(page.getByText("Clublid inactief")).toBeVisible();
  await expect(page.getByText("Padelprofiel inactief")).toBeVisible();
  await expect(page.getByText("Padelniveau ontbreekt")).toBeVisible();

  const preview = page.getByRole("heading", { name: "Plannerinput" }).locator("xpath=ancestor::section[1]");
  await expect(preview.getByText("Ready Hele Avond")).toBeVisible();
  await expect(preview.getByText("Ready Partieel")).toBeVisible();
  await expect(preview.getByText("Pending Speler")).toHaveCount(0);
  await expect(preview.getByText("Afgemelde Speler")).toHaveCount(0);

  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/5[bce]100000-|example\.test|registration_id|member_id|user_id/u);
  await expect(page.locator('main input, main select, main textarea, main button[type="submit"]')).toHaveCount(0);
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
});

test("admin sees the event-specific tennis ranking without a planner preview", async ({ page, request }) => {
  await page.goto("/login?next=/beheer");
  await signIn(page, request, email("admin-no-member"));
  const card = page.getByRole("heading", { name: "WEB-5B1 Tennisavond" }).locator("xpath=ancestor::section[1]");
  await card.getByRole("link", { name: "Deelnemers bekijken" }).click();
  await expect(page.getByRole("heading", { name: "WEB-5B1 Tennisavond" })).toBeVisible();
  await expect(page.getByText("Tennisniveau")).toBeVisible();
  await expect(page.getByText("Gegevens compleet")).toBeVisible();
  await expect(page.getByText("Tennisplanner wordt in een volgende stap toegevoegd.")).toBeVisible();
  await expect(page.getByText("Padelniveau 4")).toHaveCount(0);
  await expect(page.getByText("Klaar voor planner")).toHaveCount(0);
});
