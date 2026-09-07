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
  await page.getByLabel("Kremer Baan").check();
  await page.getByLabel("ZGA/F&F Baan").uncheck();
  await page.getByLabel("Niveaumix").fill("80");
  await expect(page.getByText(/Niet-opgeslagen wijzigingen/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "Schema genereren" })).toBeDisabled();
  await page.getByRole("button", { name: "Planneropzet opslaan" }).click();

  await expect(page.getByText("Planneropzet opgeslagen.")).toBeVisible();
  await expect(page.getByText("Revisie 2", { exact: false })).toBeVisible();
  await expect(page.locator('input[value="Handmatig Eén"]')).toBeVisible();

  const diagnosticFixture = await request.post(`${MOCK_URL}/__test/planner-diagnostic-failure`, {
    data: { enabled: true },
  });
  expect(diagnosticFixture.ok()).toBe(true);
  await page.getByRole("button", { name: "Schema genereren" }).click();
  const diagnosticHeading = page.getByRole("heading", { name: "De planneropzet is niet speelbaar." });
  const diagnostic = page.getByRole("alert").filter({ has: diagnosticHeading });
  await expect(diagnosticHeading).toBeVisible();
  await expect(diagnostic).toContainText("Om 20:40 zijn 8 spelers beschikbaar; voor 3 banen zijn er 12 nodig.");
  await expect(diagnostic).toContainText("De planneropzet is structureel niet speelbaar.");
  await expect(diagnostic.getByRole("link", { name: "Instellingen aanpassen" })).toHaveAttribute("href", "#planner-settings");
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

  const decline = await request.post(`${MOCK_URL}/__test/staff-registration`, {
    data: {
      registration_id: "5e100000-0000-4000-8000-000000000001",
      response: "declined",
    },
  });
  expect(decline.ok()).toBe(true);
  await page.goto("/beheer/tos/web5b1-padel");
  await page.getByRole("button", { name: "Aanmeldingen verwerken" }).click();
  await expect(page.getByText("Aanmeldingen zijn bijgewerkt. Genereer en publiceer het schema opnieuw om de wijzigingen live te zetten.")).toBeVisible();
  await expect(page.locator('input[value="Ready Hele Avond"]')).toHaveCount(0);
  await expect(page.locator('input[value="Handmatig Eén"]')).toBeVisible();

  await page.goto("/live");
  await expect(page.locator("body")).toContainText("Ready Hele Avond");
  await page.goto("/beheer/tos/web5b1-padel");
  await page.getByRole("button", { name: "Publicatie intrekken" }).click();
  await expect(page.getByText("Publicatie ingetrokken.")).toBeVisible();
  await page.goto("/live");
  await expect(page.locator("body")).not.toContainText("Ready Hele Avond");

  const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
});

test("12-player three-court planner succeeds best effort with and without pause", async ({ page, request }) => {
  const fixture = await request.post(`${MOCK_URL}/__test/planner-best-effort-fixture`);
  expect(fixture.ok()).toBe(true);
  await page.goto("/login?next=/beheer");
  await signIn(page, request, "planner-no-member", /\/beheer$/u, "Beheeromgeving");
  await page.goto("/beheer/tos/web5b1-padel");

  await expect(page.getByText("12 geselecteerd")).toBeVisible();
  await page.getByRole("button", { name: "Schema genereren" }).click();
  await expect(page.getByRole("heading", { name: "Controleer het voorstel" })).toBeVisible();
  await expect(page.getByLabel("Kwaliteit van het schema")).toContainText("tegenstanderherhalingen: 6");
  await expect(page.getByText("Geen geldig schema gevonden.")).toHaveCount(0);
  await expect(page.getByText("Ronde 6", { exact: false }).first()).toBeVisible();

  await page.getByLabel("Pauze").fill("5");
  await page.getByRole("button", { name: "Planneropzet opslaan" }).click();
  await expect(page.getByText("Planneropzet opgeslagen.")).toBeVisible();
  await page.getByRole("button", { name: "Schema genereren" }).click();
  await expect(page.getByRole("heading", { name: "Controleer het voorstel" })).toBeVisible();
  await expect(page.getByLabel("Kwaliteit van het schema")).toContainText("tegenstanderherhalingen: 2");
  await expect(page.getByText("Ronde 5", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Ronde 6", { exact: false })).toHaveCount(0);
  const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
});

test("participant is denied while staff can prepare a Tennis planner draft", async ({ page, request }) => {
  await page.goto("/login?next=/beheer");
  await signIn(page, request, "participant", /\/tos$/u, "TOS-avonden");
  await page.goto("/beheer/tos/web5b1-padel");
  await expect(page).toHaveURL(/\/account$/u);
  await expect(page.getByRole("heading", { name: "Planneropzet" })).toHaveCount(0);

  await page.getByRole("button", { name: "Uitloggen" }).click();
  await page.goto("/login?next=/beheer");
  await signIn(page, request, "admin-no-member", /\/beheer$/u, "Beheeromgeving");
  await page.goto("/beheer/banen");
  const create = page.getByRole("heading", { name: "Nieuwe baan" }).locator("xpath=ancestor::section[1]");
  await create.getByLabel("Sport").selectOption("tennis");
  await create.getByLabel("Naam").fill("Tennisbaan Noord");
  await create.getByRole("button", { name: "Baan toevoegen" }).click();
  await expect(page.getByText("Baan opgeslagen.")).toBeVisible();
  await page.goto("/beheer/tos/web5b1-tennis");
  await expect(page.getByRole("heading", { name: "Planneropzet" })).toBeVisible();
  await page.getByRole("button", { name: "Aanmeldingen verwerken" }).click();
  await addManualPlayer(page, 0, "Tennis Twee", "3");
  await addManualPlayer(page, 1, "Tennis Drie", "3");
  await addManualPlayer(page, 2, "Tennis Vier", "2");
  await page.getByLabel("Tennisbaan Noord").check();
  await page.getByRole("button", { name: "Planneropzet opslaan" }).click();
  await expect(page.getByText("Planneropzet opgeslagen.")).toBeVisible();
  await page.getByRole("button", { name: "Schema genereren" }).click();
  await expect(page.getByRole("heading", { name: "Controleer het voorstel" })).toBeVisible();
});
