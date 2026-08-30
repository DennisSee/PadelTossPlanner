import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const VIEWPORTS = new Set(["phone-360", "phone-390", "tablet-768", "desktop-1440"]);
const MOCK_URL = "http://127.0.0.1:45391";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!VIEWPORTS.has(testInfo.project.name), "WEB-10.2 home-gate draait op 360px, 390px, 1024px en 1440px.");
  if (testInfo.project.name === "tablet-768") await page.setViewportSize({ width: 1024, height: 900 });
});

test.afterEach(async ({ request }) => {
  expect((await request.post(`${MOCK_URL}/__test/reset-state`)).ok()).toBe(true);
});

function email(prefix: string) {
  return `${prefix}-${randomUUID()}@example.test`;
}

async function latestOtp(request: APIRequestContext, address: string) {
  const response = await request.post(`${MOCK_URL}/__test/latest-otp`, { data: { email: address } });
  expect(response.ok()).toBe(true);
  return String((await response.json()).token);
}

async function signInHome(page: Page, request: APIRequestContext, address: string) {
  await page.goto("/login?next=%2Ftos");
  await page.getByLabel("E-mailadres").fill(address);
  await expect(page.getByLabel("E-mailadres")).toHaveAttribute("type", "email");
  await expect(page.getByLabel("E-mailadres")).toHaveAttribute("autocomplete", "email");
  await expect(page.getByLabel("E-mailadres")).toHaveAttribute("inputmode", "email");
  await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click();
  await page.getByLabel("Inlogcode").fill(await latestOtp(request, address));
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  await expect(page).toHaveURL(/\/tos$/u);
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/u);
}

async function noHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
}

test("home kiest de eerstvolgende geplaatste registratie", async ({ page, request }) => {
  await signInHome(page, request, email("dashboard-web10"));
  await expect(page.getByRole("heading", { level: 1, name: "Je volgende TOS staat klaar." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bekijk je aanmelding" })).toHaveAttribute("href", "/tos/vrijdag-padel");
  await expect(page.getByRole("heading", { name: "Jouw volgende TOS" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Aanmelding wijzigen" })).toBeVisible();
  await expect(page.getByText("✓ Geplaatst")).toBeVisible();
  await expect(page.getByText(/Je doet mee/u)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(1);
  await noHorizontalOverflow(page);
});

test("home toont uitsluitend tijdens een geplaatste lopende TOS een live hero", async ({ page, request }) => {
  const address = email("home-live");
  const fixture = await request.post(`${MOCK_URL}/__test/home-state`, {
    data: { email: address, state: "live" },
  });
  expect(fixture.ok()).toBe(true);
  await signInHome(page, request, address);
  await expect(page.getByRole("heading", { level: 1, name: "Jouw TOS-avond. Live." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bekijk live TOS-schema" })).toHaveAttribute(
    "href",
    "/live/vrijdag-padel",
  );
  await noHorizontalOverflow(page);
});

test("home toont na sluiting zonder publicatie alleen de eventstatus", async ({ page, request }) => {
  const address = email("home-closed");
  expect((await request.post(`${MOCK_URL}/__test/home-state`, {
    data: { email: address, state: "closed" },
  })).ok()).toBe(true);
  await signInHome(page, request, address);
  await expect(page.getByRole("heading", { level: 1, name: "Je plaats staat vast." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bekijk TOS-avond" }).first()).toHaveAttribute("href", "/tos/vrijdag-padel");
  await expect(page.getByText("Schema volgt", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Aanmelding wijzigen" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Bekijk je schema" })).toHaveCount(0);
  await noHorizontalOverflow(page);
});

test("home toont na sluiting uitsluitend een echt gepubliceerd schema", async ({ page, request }) => {
  const address = email("home-closed-published");
  expect((await request.post(`${MOCK_URL}/__test/home-state`, {
    data: { email: address, state: "closed-published" },
  })).ok()).toBe(true);
  await signInHome(page, request, address);
  await expect(page.getByRole("heading", { level: 1, name: "Je schema staat klaar." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bekijk je schema" }).first()).toHaveAttribute("href", "/live/vrijdag-padel");
  await expect(page.getByRole("link", { name: "Aanmelding wijzigen" })).toHaveCount(0);
  await noHorizontalOverflow(page);
});

test("home toont een wachtlijstregistratie met de juiste actie", async ({ page, request }) => {
  const address = email("home-waitlist");
  const fixture = await request.post(`${MOCK_URL}/__test/home-state`, {
    data: { email: address, state: "waitlist" },
  });
  expect(fixture.ok()).toBe(true);
  await signInHome(page, request, address);
  await expect(page.getByRole("heading", { level: 1, name: "Je staat op de wachtlijst." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bekijk je status" }).first()).toHaveAttribute(
    "href",
    "/tos/tennis-avond-2026",
  );
  await noHorizontalOverflow(page);
});

test("home houdt een gesloten wachtlijst op de statusroute", async ({ page, request }) => {
  const address = email("home-waitlist-closed");
  expect((await request.post(`${MOCK_URL}/__test/home-state`, {
    data: { email: address, state: "waitlist-closed" },
  })).ok()).toBe(true);
  await signInHome(page, request, address);
  await expect(page.getByRole("link", { name: "Bekijk je status" }).first()).toHaveAttribute(
    "href", "/tos/tennis-avond-2026",
  );
  await expect(page.getByRole("link", { name: "Bekijk je schema", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Bekijk live schema", exact: true })).toHaveCount(0);
  await noHorizontalOverflow(page);
});

test("home valt terug op de eerste open TOS", async ({ page, request }) => {
  await signInHome(page, request, email("home-open"));
  await expect(page.getByRole("heading", { level: 1, name: "Zin in een TOS-avond?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bekijk TOS-avonden" })).toHaveAttribute("href", "/tos");
  await expect(page.getByRole("link", { name: "Aanmelden" })).toHaveAttribute(
    "href",
    "/tos/vrijdag-padel",
  );
  await noHorizontalOverflow(page);
});

test("home heeft een rustige lege participantstate", async ({ page, request }) => {
  const address = email("home-empty");
  const fixture = await request.post(`${MOCK_URL}/__test/home-state`, {
    data: { email: address, state: "empty" },
  });
  expect(fixture.ok()).toBe(true);
  await signInHome(page, request, address);
  await expect(page.getByRole("heading", { level: 1, name: "Samen spelen. Iedere ronde anders." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Geen aankomende TOS-avonden" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bekijk alle TOS-avonden" })).toHaveAttribute("href", "/tos");
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
  await noHorizontalOverflow(page);
});
