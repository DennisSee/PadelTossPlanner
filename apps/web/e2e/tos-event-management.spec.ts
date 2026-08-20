import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const VIEWPORTS = new Set(["phone-390", "desktop-1440"]);
const MOCK_URL = "http://127.0.0.1:45391";

test.beforeEach(async ({}, testInfo) => {
  test.skip(!VIEWPORTS.has(testInfo.project.name), "WEB-5A draait gericht op 390px en 1440px.");
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

async function logout(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: "Uitloggen" }).click();
}

test("guards beheer by staff role, not membership", async ({ page, request }) => {
  await page.goto("/beheer");
  await expect(page).toHaveURL(/\/login\?next=%2Fbeheer$/u);

  await signIn(page, request, email("participant"));
  await expect(page).toHaveURL(/\/tos$/u);
  await page.goto("/beheer");
  await expect(page).toHaveURL(/\/account$/u);
  await expect(page.getByRole("heading", { name: "Beheeromgeving" })).toHaveCount(0);

  await logout(page);
  await page.goto("/login?next=/beheer");
  await signIn(page, request, email("planner-no-member"));
  await expect(page).toHaveURL(/\/beheer$/u);
  await expect(page.getByRole("heading", { name: "Beheeromgeving" })).toBeVisible();

  await logout(page);
  await page.goto("/login?next=/beheer");
  await signIn(page, request, email("admin-no-member"));
  await expect(page).toHaveURL(/\/beheer$/u);
  await expect(page.getByText("Admin").first()).toBeVisible();
});

test("lists all statuses and creates, opens and cancels a server-slugged event", async ({ page, request }) => {
  await page.goto("/login?next=/beheer");
  const staffEmail = email("planner-no-member");
  await signIn(page, request, staffEmail);

  for (const label of ["Concept", "Open voor inschrijving", "Inschrijving gesloten", "Geannuleerd"]) {
    await expect(page.locator("span", { hasText: label }).first()).toBeVisible();
  }
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);

  const unique = randomUUID().slice(0, 8);
  const title = `TOS vrijdag ${unique}`;
  await page.getByLabel("Titel").first().fill(title);
  await page.getByRole("button", { name: "TOS-avond aanmaken" }).click();
  await expect(page).toHaveURL(/\/beheer\?notice=event-created$/u);
  const card = page.getByRole("heading", { name: title, exact: true }).locator("xpath=ancestor::section[1]");
  await expect(card).toBeVisible();
  const detailLink = card.getByRole("link", { name: "Eventpagina bekijken" });
  const href = await detailLink.getAttribute("href");
  expect(href).toMatch(/^\/tos\/padel-tos-\d{8}-[0-9a-f]{8}$/u);

  await card.getByLabel("Titel").fill(`${title} open`);
  await card.getByLabel("Status").selectOption("open");
  await card.getByRole("button", { name: "Wijzigingen opslaan" }).click();
  await expect(page).toHaveURL(/\/beheer\?notice=event-updated$/u);
  await expect(page.getByRole("heading", { name: `${title} open` })).toBeVisible();

  const publicResponse = await request.get(`http://127.0.0.1:31000${href}`);
  expect(publicResponse.status()).toBe(200);
  expect(await publicResponse.text()).toContain(`${title} open`);

  const updatedCard = page.getByRole("heading", { name: `${title} open`, exact: true }).locator("xpath=ancestor::section[1]");
  await updatedCard.getByLabel("Status").selectOption("cancelled");
  await updatedCard.getByRole("button", { name: "Wijzigingen opslaan" }).click();
  const hidden = await request.get(`http://127.0.0.1:31000${href}`);
  expect(hidden.status()).toBe(404);
});

const forgedCreateFields = {
  title: "Forged event",
  sport: "padel",
  event_date: "2026-08-28",
  starts_at: "20:00",
  ends_at: "22:00",
  signup_deadline: "2026-08-28T19:00",
  status: "draft",
};

test("rejects forged authority fields", async ({ page, request }) => {
  await page.goto("/login?next=/beheer");
  await signIn(page, request, email("planner-no-member"));
  const forged = await page.request.post("/api/beheer/tos/create", {
    form: { ...forgedCreateFields, created_by: randomUUID() },
    headers: { origin: "http://127.0.0.1:31000" },
    maxRedirects: 0,
  });
  expect(forged.status()).toBe(303);
  expect(forged.headers().location).toBe("http://127.0.0.1:31000/beheer?error=invalid-request");
  await expect(page.getByRole("heading", { name: "Forged event" })).toHaveCount(0);
});

test("rejects participant direct event writes", async ({ page, request }) => {
  await page.goto("/login?next=/tos");
  await signIn(page, request, email("participant"));
  await expect(page).toHaveURL(/\/tos$/u);
  await Promise.all([
    page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame()),
    page.evaluate((fields) => {
      const form = document.createElement("form");
      form.method = "post";
      form.action = "/api/beheer/tos/create";
      for (const [name, value] of Object.entries(fields)) {
        const input = document.createElement("input");
        input.name = name;
        input.value = value;
        form.append(input);
      }
      document.body.append(form);
      form.submit();
    }, { ...forgedCreateFields, status: "open" }).catch(() => undefined),
  ]);
  await expect(page).toHaveURL(/\/tos$/u);
  await expect(page.getByRole("heading", { name: "TOS-avonden" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Forged event" })).toHaveCount(0);
});
