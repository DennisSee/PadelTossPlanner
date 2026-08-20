import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const TOS_VIEWPORTS = new Set(["phone-390", "desktop-1440"]);
const MOCK_URL = "http://127.0.0.1:45391";

test.beforeEach(async ({}, testInfo) => {
  test.skip(!TOS_VIEWPORTS.has(testInfo.project.name), "WEB-4B draait gericht op 390px en 1440px.");
});

function testEmail(prefix: string) {
  return `${prefix}-${randomUUID()}@example.test`;
}

async function latestOtp(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post(`${MOCK_URL}/__test/latest-otp`, { data: { email } });
  expect(response.ok()).toBe(true);
  return String((await response.json()).token);
}

async function signIn(page: Page, request: APIRequestContext, email: string) {
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click();
  await page.getByLabel("Inlogcode").fill(await latestOtp(request, email));
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
}

async function configureGoogle(request: APIRequestContext, email: string) {
  const response = await request.post(`${MOCK_URL}/__test/oauth`, { data: { email, outcome: "success" } });
  expect(response.ok()).toBe(true);
}

async function assertNoHorizontalOverflow(page: Page) {
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
}

test("openbare detaildeeplink bewaart exact dezelfde OTP-return zonder private data", async ({ page, request }) => {
  await page.goto("/tos/vrijdag-padel");
  await expect(page.getByRole("heading", { name: "Padel TOS vrijdagavond" })).toBeVisible();
  await expect(page.getByText(/Wie doen er mee/u)).toHaveCount(0);
  await expect(page.getByText(/Dennis|Marieke/u)).toHaveCount(0);
  const login = page.locator('a[href="/login?next=%2Ftos%2Fvrijdag-padel"]');
  await expect(login).toHaveAttribute("href", "/login?next=%2Ftos%2Fvrijdag-padel");
  await login.click();
  await signIn(page, request, testEmail("detail-otp"));
  await expect(page).toHaveURL(/\/tos\/vrijdag-padel$/u);
  await expect(page.getByRole("heading", { name: "Wie doen er mee?" })).toBeVisible();
  await expect(page.getByText("<b>Veilige testnaam</b>", { exact: false })).toBeVisible();
  await expect(page.locator("b", { hasText: "Veilige testnaam" })).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
});

test("Google PKCE gebruikt dezelfde dynamische eventreturn en malicious next valt terug", async ({ page, request }) => {
  await configureGoogle(request, testEmail("detail-google"));
  await page.goto("/login?next=/tos/vrijdag-padel");
  await page.getByRole("button", { name: "Doorgaan met Google" }).click();
  await expect(page).toHaveURL(/\/tos\/vrijdag-padel$/u);

  await page.goto("/account");
  await page.getByRole("button", { name: "Uitloggen" }).click();
  await configureGoogle(request, testEmail("detail-google-safe"));
  await page.goto("/login?next=%2Ftos%2F%252F%252Fevil.example");
  await page.getByRole("button", { name: "Doorgaan met Google" }).click();
  await expect(page).toHaveURL(/\/tos$/u);
  expect(page.url()).not.toContain("evil.example");
});

test("role-neutrale self-onboarding werkt, maar een inactief profiel krijgt nooit onboarding", async ({ page, request }) => {
  const email = testEmail("admin-no-member");
  await page.goto("/login?next=/tos/vrijdag-padel");
  await signIn(page, request, email);
  await expect(page).toHaveURL(/\/tos\/vrijdag-padel$/u);
  await expect(page.getByText("Admin").first()).toBeVisible();
  await page.getByLabel("Naam").fill("Admin Clublid");
  await page.getByRole("button", { name: "Clubprofiel aanmaken" }).click();
  await expect(page).toHaveURL(/\/tos\/vrijdag-padel\?notice=profile-created$/u);
  await expect(page.getByText("Admin").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wie doen er mee?" })).toBeVisible();

  await page.goto("/account");
  await page.getByRole("button", { name: "Uitloggen" }).click();
  await page.goto("/login?next=/tos");
  await signIn(page, request, testEmail("inactive-profile-no-member"));
  await expect(page.getByRole("heading", { name: "Clubprofiel inactief" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clubprofiel aanmaken" })).toHaveCount(0);

  await page.goto("/account");
  await page.getByRole("button", { name: "Uitloggen" }).click();
  await page.goto("/login?next=/tos/vrijdag-padel");
  await signIn(page, request, testEmail("pending-onboarding-no-member"));
  await page.getByLabel("Naam").fill("Nieuw Pending Lid");
  await page.getByRole("button", { name: "Clubprofiel aanmaken" }).click();
  await expect(page.getByRole("heading", { name: "Goedkeuring in behandeling" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wie doen er mee?" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Aanmeld/u })).toHaveCount(0);
});

test("dashboard houdt attending, declined, closed en cancelled eigen rijen buiten Nog aanmelden", async ({ page, request }) => {
  await page.goto("/login?next=/tos");
  await signIn(page, request, testEmail("admin-dashboard"));
  const own = page.getByRole("region", { name: "Mijn komende TOS" });
  const available = page.getByRole("region", { name: "Nog aanmelden" });
  await expect(own.getByText("Padel TOS vrijdagavond")).toBeVisible();
  await expect(own.getByText("Tennis TOS voor alle clubleden")).toBeVisible();
  await expect(own.getByText("Afgemeld")).toBeVisible();
  await expect(own.getByText("Eigen gesloten TOS")).toBeVisible();
  await expect(own.getByText("Eigen geannuleerde TOS")).toBeVisible();
  await expect(available.getByText("Tennis TOS voor alle clubleden")).toHaveCount(0);
  await expect(available.getByText("TOS over middernacht", { exact: false })).toBeVisible();
  await expect(page.getByText(/3 deelnemers/u).first()).toBeVisible();
  await assertNoHorizontalOverflow(page);

  const closedLink = own.locator('a[href="/tos/eigen-gesloten-tos"]');
  await expect(closedLink).toHaveAttribute("href", "/tos/eigen-gesloten-tos");
  await closedLink.click();
  await expect(page).toHaveURL(/\/tos\/eigen-gesloten-tos$/u);
  await expect(page.getByRole("heading", { name: "Eigen gesloten TOS" })).toBeVisible();
  await expect(page.getByText("Deze aanmelding kan niet meer worden gewijzigd.")).toBeVisible();
});

test("een geïsoleerde namen-RPC-fout breekt de overige open events niet", async ({ page, request }) => {
  await page.goto("/login?next=/tos");
  await signIn(page, request, testEmail("attendee-failure"));
  await expect(page).toHaveURL(/\/tos$/u);
  const fixture = await request.post(`${MOCK_URL}/__test/attendee-failure`, {
    data: { slug: "tennis-avond-2026" },
  });
  expect(fixture.ok()).toBe(true);
  await page.reload();
  const available = page.getByRole("region", { name: "Nog aanmelden" });
  await expect(available.getByText("Padel TOS vrijdagavond")).toBeVisible();
  await expect(available.getByText("Tennis TOS voor alle clubleden")).toBeVisible();
  await expect(available.getByText("De deelnemerslijst is tijdelijk niet beschikbaar.")).toHaveCount(1);
  await expect(available.getByText(/3 deelnemers/u).first()).toBeVisible();
});

test("aanmelden, minutenavailability, afmelden en opnieuw aanmelden behouden exact één rij", async ({ page, request }) => {
  await page.goto("/login?next=/tos/vrijdag-padel");
  await signIn(page, request, testEmail("registration-flow"));
  const from = page.getByLabel("Vanaf");
  const until = page.getByLabel("Tot");
  await expect(from).toHaveAttribute("step", "60");
  const originalFrom = await from.inputValue();
  const originalUntil = await until.inputValue();
  const originalMinutes = Number(originalFrom.slice(0, 2)) * 60 + Number(originalFrom.slice(3));
  const changedMinutes = (originalMinutes + 1) % (24 * 60);
  const customMinute = `${Math.floor(changedMinutes / 60).toString().padStart(2, "0")}:${(changedMinutes % 60).toString().padStart(2, "0")}`;
  await from.fill(customMinute);
  await page.getByRole("button", { name: "Aanmelden", exact: true }).click();
  await expect(page).toHaveURL(/notice=registration-created/u);
  await expect(page.getByLabel("Vanaf")).toHaveValue(customMinute);
  await expect(page.getByLabel("Tot")).toHaveValue(originalUntil);

  await page.getByLabel("Ik doe niet mee").click();
  await page.getByRole("button", { name: "Aanmelding wijzigen" }).click();
  await expect(page).toHaveURL(/notice=registration-declined/u);
  await expect(page.getByLabel("Ik doe niet mee")).toBeChecked();

  await page.goto("/tos");
  const own = page.getByRole("region", { name: "Mijn komende TOS" });
  const available = page.getByRole("region", { name: "Nog aanmelden" });
  await expect(own.getByText("Padel TOS vrijdagavond")).toBeVisible();
  await expect(available.getByText("Padel TOS vrijdagavond")).toHaveCount(0);

  await own.getByRole("link", { name: "Aanmelding wijzigen" }).first().click();
  await page.getByLabel("Ik doe mee").click();
  await page.getByRole("button", { name: "Aanmelding wijzigen" }).click();
  await expect(page).toHaveURL(/notice=registration-updated/u);
  await expect(page.getByLabel("Ik doe mee")).toBeChecked();
});

test("deadline, closed en cancelled blijven read-only en verborgen events lekken niet", async ({ page, request }) => {
  await page.goto("/login?next=/tos/deadline-verstreken");
  await signIn(page, request, testEmail("closed-boundary"));
  await expect(page.getByText("Deze aanmelding kan niet meer worden gewijzigd.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Aanmeld/u })).toHaveCount(0);

  const hiddenClosed = await page.goto("/tos/eigen-gesloten-tos");
  expect(hiddenClosed?.status()).toBe(404);
  await expect(page.getByText("Eigen gesloten TOS")).toHaveCount(0);
  const hiddenCancelled = await page.goto("/tos/eigen-geannuleerde-tos");
  expect(hiddenCancelled?.status()).toBe(404);
  await expect(page.getByText("Eigen geannuleerde TOS")).toHaveCount(0);
});
