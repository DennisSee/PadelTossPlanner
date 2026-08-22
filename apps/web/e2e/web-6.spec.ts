import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const VIEWPORTS = new Set(["phone-390", "desktop-1440"]);
const MOCK_URL = "http://127.0.0.1:45391";

test.beforeEach(async ({}, testInfo) => {
  test.skip(!VIEWPORTS.has(testInfo.project.name), "WEB-6 eindgate draait op 390px en 1440px.");
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
  await page.waitForLoadState("networkidle");
}

async function logout(page: Page) {
  if (new URL(page.url()).pathname !== "/account") {
    await page.goto("/account");
  }
  await page.getByRole("button", { name: "Uitloggen" }).click();
}

async function noHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
}

test("participant filters, capaciteit en veilige deelnemerssheet werken samen", async ({ page, request }) => {
  await page.goto("/login?next=/tos");
  await signIn(page, request, email("web6-participant"));

  await expect(page.getByLabel("Status")).toHaveValue("open");
  await expect(page.getByLabel("Sport")).toHaveValue("all");
  await expect(page.getByText("3 TOS-avonden")).toBeVisible();
  await page.getByLabel("Sport").selectOption("tennis");
  await expect(page).toHaveURL(/\/tos\?status=open&sport=tennis$/u);
  await expect(page.getByText("1 TOS-avond")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tennis TOS voor alle clubleden", level: 3 })).toBeVisible();
  await expect(page.getByLabel("2 van 2 plaatsen bezet")).toBeVisible();
  await expect(page.getByText("1 op wachtlijst").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Op wachtlijst" })).toBeVisible();

  await page.getByRole("button", { name: "Bekijk deelnemers" }).click();
  const dialog = page.getByRole("dialog", { name: "Tennis TOS voor alle clubleden" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Deelnemers (2)" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Wachtlijst (1)" })).toBeVisible();
  await expect(dialog.getByText("Dennis")).toBeVisible();
  await expect(dialog.getByText("<b>Veilige testnaam</b>", { exact: true })).toBeVisible();
  await expect(dialog.locator("b")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Sluiten" }).last().click();

  await page.getByRole("link", { name: "Filters wissen" }).click();
  await expect(page).toHaveURL(/\/tos$/u);
  await noHorizontalOverflow(page);
});

test("staff beheert capaciteit en onafhankelijke sportprofielen zonder membership", async ({ page, request }) => {
  await page.goto("/login?next=/beheer");
  await signIn(page, request, email("planner-no-member"));

  await expect(page.getByLabel("Starttijd").first()).toHaveAttribute("step", "60");
  await expect(page.getByLabel(/Inschrijfdeadline/u).first()).toHaveAttribute("step", "60");
  await expect(page.getByLabel("Maximaal aantal deelnemers").first()).toHaveValue("24");
  const filters = page.locator("form").filter({ has: page.getByRole("button", { name: "Filteren" }) });
  await filters.getByLabel("Status").selectOption("all");
  await filters.getByRole("button", { name: "Filteren" }).click();
  await expect(page).toHaveURL(/\/beheer\?status=all&sport=all$/u);
  await expect(page.getByText("9 events")).toBeVisible();

  await page.getByRole("link", { name: "Ledenbeheer" }).click();
  await expect(page).toHaveURL(/\/beheer\/leden$/u);
  await page.getByLabel("Zoeken op naam of e-mailadres").fill("Ready Partieel");
  await page.getByRole("button", { name: "Zoeken" }).click();
  const card = page.getByRole("heading", { name: "Ready Partieel" }).locator("xpath=ancestor::section[1]");
  await expect(card).toBeVisible();
  const tennis = card.getByRole("heading", { name: "Tennis" }).locator("xpath=ancestor::form[1]");
  await tennis.getByLabel("Profiel").selectOption("true");
  await tennis.getByLabel("Niveau").selectOption("5");
  await tennis.getByRole("button", { name: "Tennisprofiel opslaan" }).click();
  await expect(page).toHaveURL(/\/beheer\/leden\?notice=sport-profile-updated$/u);
  await expect(page.getByRole("status")).toContainText("sportprofiel is bijgewerkt");
  const updated = page.getByRole("heading", { name: "Ready Partieel" }).locator("xpath=ancestor::section[1]");
  await expect(updated.getByRole("heading", { name: "Padel" }).locator("xpath=ancestor::form[1]").getByLabel("Niveau"))
    .toHaveValue("3");
  await expect(updated.getByRole("heading", { name: "Tennis" }).locator("xpath=ancestor::form[1]").getByLabel("Niveau"))
    .toHaveValue("5");
  await noHorizontalOverflow(page);
});

test("accountnaam blijft een smalle eigen mutation en wordt direct herladen", async ({ page, request }) => {
  await page.goto("/login?next=/account");
  await signIn(page, request, email("web6-account"));
  const name = `Nieuwe Naam ${randomUUID().slice(0, 6)}`;
  await page.getByRole("button", { name: /Zichtbare naam wijzigen/u }).click();
  const dialog = page.getByRole("dialog", { name: "Zichtbare naam wijzigen" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Zichtbare naam").fill(name);
  await dialog.getByRole("button", { name: "Naam opslaan" }).click();
  await expect(page).toHaveURL(/\/account\?notice=display-name-updated$/u);
  await expect(page.getByText("Je naam is bijgewerkt.", { exact: true })).toBeVisible();
  await expect(page.getByText(name).first()).toBeVisible();
  await page.getByRole("button", { name: /Zichtbare naam wijzigen/u }).click();
  await expect(page.getByRole("dialog", { name: "Zichtbare naam wijzigen" }).getByLabel("Zichtbare naam")).toHaveValue(name);
});

test("staff onderscheidt dubbele displaynamen uitsluitend in ledenbeheer via login-email", async ({ page, request }) => {
  const first = email("duplicate-one");
  const second = email("duplicate-two");
  await page.goto("/login?next=/account");
  await signIn(page, request, first);
  await expect(page).toHaveURL(/\/account$/u);
  await logout(page);
  await page.goto("/login?next=/account");
  await signIn(page, request, second);
  await expect(page).toHaveURL(/\/account$/u);
  await logout(page);

  await page.goto("/login?next=/beheer/leden");
  await signIn(page, request, email("planner-no-member"));
  await page.getByLabel("Zoeken op naam of e-mailadres").fill("Testlid");
  await page.getByRole("button", { name: "Zoeken" }).click();
  await expect(page.getByRole("heading", { name: "Testlid" })).toHaveCount(2);
  await expect(page.getByText(first)).toBeVisible();
  await expect(page.getByText(second)).toBeVisible();
  await noHorizontalOverflow(page);

  await page.goto("/tos");
  await expect(page.getByText(first)).toHaveCount(0);
  await expect(page.getByText(second)).toHaveCount(0);
});
