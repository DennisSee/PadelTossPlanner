import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const VIEWPORTS = new Set(["phone-390", "tablet-768", "desktop-1440"]);
const MOCK_URL = "http://127.0.0.1:45391";
test.beforeEach(async ({}, info) => { test.skip(!VIEWPORTS.has(info.project.name), "WEB-7 visuele gate draait op 390, 768 en 1440px."); });
test.afterEach(async ({ request }) => { expect((await request.post(`${MOCK_URL}/__test/reset-state`)).ok()).toBe(true); });

function email(prefix: string) { return `${prefix}-${randomUUID()}@example.test`; }
async function latestOtp(request: APIRequestContext, address: string) { const response = await request.post(`${MOCK_URL}/__test/latest-otp`, { data: { email: address } }); expect(response.ok()).toBe(true); return String((await response.json()).token); }
async function signIn(page: Page, request: APIRequestContext, address: string) { await page.getByLabel("E-mailadres").fill(address); await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click(); await page.getByLabel("Inlogcode").fill(await latestOtp(request, address)); await page.getByRole("button", { name: "Inloggen", exact: true }).click(); }
async function noOverflow(page: Page) { const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth })); expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1); }

test("official history is membership-gated, responsive and never exposes contact details early", async ({ page, request }) => {
  await page.goto("/login?next=/historie");
  await signIn(page, request, email("web7-member"));
  await expect(page).toHaveURL(/\/historie$/u);
  await expect(page.getByRole("heading", { name: "Mijn TOS-historie", level: 1 })).toBeVisible();
  await expect(page.locator('a[href="/historie"]').first()).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Zomeravond TOS" })).toBeVisible();
  await page.getByRole("heading", { name: "Zomeravond TOS" }).click();
  await expect(page.getByText("Kremer Baan")).toBeVisible();
  await expect(page.getByText("Gastspeler")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("clubgenoot@example.test");
  await noOverflow(page);
});

test("empty official history has a calm private empty state", async ({ page, request }) => {
  await page.goto("/login?next=/historie");
  await signIn(page, request, email("empty-history"));
  await expect(page).toHaveURL(/\/historie$/u);
  await expect(page.getByText("Nog geen officiële TOS-historie gevonden met deze filters.")).toBeVisible();
  await expect(page.getByText("Nog geen clubgenoten in je officiële historie.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("clubgenoot@example.test");
  await noOverflow(page);
});

test("clubmate contact starts as consent request and keeps e-mail hidden", async ({ page, request }) => {
  await page.goto("/login?next=/historie");
  await signIn(page, request, email("web7-contact"));
  await page.getByRole("button", { name: "Bekijk gedeelde historie" }).click();
  const dialog = page.getByRole("dialog", { name: "Ready Hele Avond" });
  await expect(dialog).toBeVisible();
  await noOverflow(page);
  await dialog.getByRole("button", { name: "Contactverzoek sturen" }).click();
  await expect(page).toHaveURL(/\/historie\?notice=contact-requested$/u);
  await expect(page.getByRole("status")).toHaveText("Contactverzoek verstuurd.");
  await page.getByRole("button", { name: "Bekijk gedeelde historie" }).click();
  const pendingDialog = page.getByRole("dialog", { name: "Ready Hele Avond" });
  await expect(pendingDialog).toContainText("E-mailadressen blijven verborgen");
  await expect(page.locator("body")).not.toContainText("clubgenoot@example.test");
  await pendingDialog.getByRole("button", { name: "Verzoek intrekken" }).click();
  await expect(page).toHaveURL(/\/historie\?notice=contact-cancelled$/u);
  await expect(page.getByRole("status")).toHaveText("Contactverzoek ingetrokken.");
  await expect(page.locator("body")).not.toContainText("clubgenoot@example.test");
});

test("incoming consent reveals contact e-mail only after acceptance and revoke hides it again", async ({ page, request }) => {
  const address = email("web7-incoming");
  const fixture = await request.post(`${MOCK_URL}/__test/history-contact`, { data: { email: address, status: "incoming" } });
  expect(fixture.ok()).toBe(true);
  await page.goto("/login?next=/historie");
  await signIn(page, request, address);
  await expect(page).toHaveURL(/\/historie$/u);
  await page.getByRole("button", { name: "Bekijk gedeelde historie" }).click();
  const incomingDialog = page.getByRole("dialog", { name: "Ready Hele Avond" });
  await expect(incomingDialog).toContainText("wil contactgegevens uitwisselen");
  await expect(page.locator("body")).not.toContainText("clubgenoot@example.test");
  await noOverflow(page);
  await incomingDialog.getByRole("button", { name: "Accepteren" }).click();
  await expect(page).toHaveURL(/\/historie\?notice=contact-accepted$/u);
  await page.getByRole("button", { name: "Bekijk gedeelde historie" }).click();
  const acceptedDialog = page.getByRole("dialog", { name: "Ready Hele Avond" });
  await expect(acceptedDialog.getByRole("link", { name: "clubgenoot@example.test" })).toBeVisible();
  await noOverflow(page);
  await acceptedDialog.getByRole("button", { name: "Toestemming intrekken" }).click();
  await expect(page).toHaveURL(/\/historie\?notice=contact-revoked$/u);
  await expect(page.locator("body")).not.toContainText("clubgenoot@example.test");
});

test("admin role controls remain separate from membership and self-role is read-only", async ({ page, request }) => {
  await page.goto("/login?next=/beheer/leden");
  await signIn(page, request, email("admin-web7"));
  await expect(page).toHaveURL(/\/beheer\/leden$/u);
  await expect(page.getByText("Je kunt je eigen rol niet wijzigen.")).toBeVisible();
  await expect(page.locator('a[href="/historie"]').first()).toHaveCount(1);
  await noOverflow(page);
});
