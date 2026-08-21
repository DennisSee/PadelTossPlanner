import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const MOCK_URL = "http://127.0.0.1:45391";

test.afterEach(async ({ request }) => {
  const response = await request.post(`${MOCK_URL}/__test/reset-state`);
  expect(response.ok()).toBe(true);
});

async function latestOtp(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post(`${MOCK_URL}/__test/latest-otp`, { data: { email } });
  expect(response.ok()).toBe(true);
  return String((await response.json()).token);
}

async function signIn(page: Page, request: APIRequestContext, prefix: string, destination: RegExp, heading: string) {
  const email = `${prefix}-${randomUUID()}@example.test`;
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click();
  await page.getByLabel("Inlogcode").fill(await latestOtp(request, email));
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  await expect(page).toHaveURL(destination);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

async function addManualPlayer(page: Page, index: number, name: string, ranking: string) {
  await page.getByRole("button", { name: "Handmatige speler toevoegen" }).click();
  const row = page.getByRole("group", { name: "Handmatige speler" }).nth(index);
  await row.getByLabel("Naam").fill(name);
  await row.getByLabel("Niveau").fill(ranking);
}

test("staff completes the event-scoped draft, private save and publication workflow", async ({ page, request }) => {
  await page.goto("/login?next=/beheer");
  await signIn(page, request, "planner-no-member", /\/beheer$/u, "Beheeromgeving");
  await page.goto("/beheer/tos/web5b1-padel");

  await expect(page.getByRole("heading", { name: "Planneropzet" })).toBeVisible();
  await page.getByRole("button", { name: "Aanmeldingen verwerken" }).click();
  await expect(page.getByText("Geldige aanmeldingen zijn in de planneropzet verwerkt.")).toBeVisible();
  await expect(page.getByText("Revisie 1", { exact: false })).toBeVisible();

  const partial = page.locator('input[value="Ready Partieel"]').locator("xpath=ancestor::fieldset");
  await partial.getByLabel("Vanaf").fill("20:00");
  await partial.getByLabel("Tot").fill("22:00");
  await addManualPlayer(page, 0, "Handmatig Eén", "3");
  await addManualPlayer(page, 1, "Handmatig Twee", "2");
  await page.getByLabel("ZGA/F&F Baan").uncheck();
  await expect(page.getByText(/Niet-opgeslagen wijzigingen/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "Schema genereren" })).toBeDisabled();
  await page.getByRole("button", { name: "Planneropzet opslaan" }).click();

  await expect(page.getByText("Planneropzet opgeslagen.")).toBeVisible();
  await expect(page.getByText("Revisie 2", { exact: false })).toBeVisible();
  await expect(page.locator('input[value="Handmatig Eén"]')).toBeVisible();
  await page.getByRole("button", { name: "Schema genereren" }).click();
  const review = page.getByRole("heading", { name: "Controleer het voorstel" }).locator("xpath=ancestor::div[contains(@class,'generation')]");
  await expect(review).toBeVisible();
  await expect(review.getByText(/Ready Hele Avond/u).first()).toBeVisible();
  await expect(review.getByText(/Niveau/u).first()).toBeVisible();

  await page.getByRole("button", { name: "Dit schema privé opslaan" }).click();
  await expect(page.getByText("Schema privé opgeslagen.")).toBeVisible();
  await expect(page.getByText("Privé schema")).toBeVisible();

  await page.goto("/live");
  await expect(page.locator("body")).not.toContainText("Ready Hele Avond");
  await page.goto("/beheer/tos/web5b1-padel");
  await page.getByRole("button", { name: "Publiceren" }).click();
  await expect(page.getByText("Schema gepubliceerd.")).toBeVisible();
  await expect(page.getByText("Gepubliceerd", { exact: true })).toBeVisible();

  await page.goto("/live");
  await expect(page.locator("body")).toContainText("Ready Hele Avond");
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/member_id|user_id|registration_id|players_private|schedule_private|statistics_private|diagnostics|Niveau T1|Teamverschil/u);

  await page.goto("/beheer/tos/web5b1-padel");
  await page.getByRole("button", { name: "Publicatie intrekken" }).click();
  await expect(page.getByText("Publicatie ingetrokken.")).toBeVisible();
  await page.goto("/live");
  await expect(page.locator("body")).not.toContainText("Ready Hele Avond");

  const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
});

test("participant and tennis event never expose padel planner controls", async ({ page, request }) => {
  await page.goto("/login?next=/beheer");
  await signIn(page, request, "participant", /\/tos$/u, "TOS-avonden");
  await page.goto("/beheer/tos/web5b1-padel");
  await expect(page).toHaveURL(/\/account$/u);
  await expect(page.getByRole("heading", { name: "Planneropzet" })).toHaveCount(0);

  await page.getByRole("button", { name: "Uitloggen" }).click();
  await page.goto("/login?next=/beheer");
  await signIn(page, request, "admin-no-member", /\/beheer$/u, "Beheeromgeving");
  await page.goto("/beheer/tos/web5b1-tennis");
  await expect(page.getByText("Tennisplanner wordt in een volgende stap toegevoegd.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Planneropzet" })).toHaveCount(0);
});
