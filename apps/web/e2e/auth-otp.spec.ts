import { randomUUID } from "node:crypto";

import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

const AUTH_VIEWPORTS = new Set(["phone-390", "desktop-1440"]);
const MOCK_URL = "http://127.0.0.1:45391";

test.beforeEach(async ({}, testInfo) => {
  test.skip(!AUTH_VIEWPORTS.has(testInfo.project.name), "Authflow is gericht op 390px en 1440px.");
});

function testEmail(prefix: string) {
  return `${prefix}-${randomUUID()}@example.test`;
}

async function latestOtp(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post(`${MOCK_URL}/__test/latest-otp`, { data: { email } });
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  return String(payload.token);
}

async function signIn(page: Page, request: APIRequestContext, email: string) {
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click();
  await expect(page.getByText(/we hebben een inlogcode gestuurd/i)).toBeVisible();
  const token = await latestOtp(request, email);
  await page.getByLabel("Inlogcode").fill(token);
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
}

async function openNavigationIfCollapsed(page: Page) {
  if ((page.viewportSize()?.width ?? 0) <= 832) {
    await page.locator('summary[aria-label="Menu openen"]').click();
  }
}

async function authCookies(page: Page) {
  return (await page.context().cookies()).filter(
    ({ name }) => name.startsWith("sb-") && name.includes("-auth-token"),
  );
}

test("participant doorloopt OTP, persistente sessie, guard en logout", async ({ page, request }) => {
  const email = testEmail("participant");
  await page.goto("/");
  await page
    .getByRole("heading", { name: "Doe mee met de volgende TOS" })
    .locator("xpath=ancestor::section[1]")
    .getByRole("link", { name: "Inloggen / aanmelden" })
    .click();
  await expect(page).toHaveURL(/\/login\?next=%2Ftos$/u);
  await signIn(page, request, email);
  await expect(page).toHaveURL(/\/tos$/u);
  await expect(page.getByRole("heading", { name: "TOS-avonden", level: 1 })).toBeVisible();

  const cookiesAfterLogin = await authCookies(page);
  expect(cookiesAfterLogin.length).toBeGreaterThan(0);
  for (const cookie of cookiesAfterLogin) {
    expect(cookie.domain).toBe("127.0.0.1");
    expect(cookie.path).toBe("/");
    expect(cookie.sameSite).toBe("Lax");
    expect(cookie.secure).toBe(false);
  }

  await page.reload();
  await expect(page).toHaveURL(/\/tos$/u);
  expect((await authCookies(page)).length).toBeGreaterThan(0);
  await page.goto("/account");
  await expect(page.getByText(email)).toBeVisible();
  await page.goto("/beheer");
  await expect(page).toHaveURL(/\/account$/u);

  const otherTab = await page.context().newPage();
  await otherTab.goto("/account");
  await expect(otherTab.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "Uitloggen" }).click();
  await expect(page).toHaveURL(/\/$/u);
  expect(await authCookies(page)).toHaveLength(0);

  await page.goBack();
  await expect(page.getByText(email)).not.toBeVisible();
  await page.reload();
  await expect(page.getByText(email)).not.toBeVisible();

  await otherTab.reload();
  await expect(otherTab).toHaveURL(/\/login\?next=%2Faccount$/u);
  await expect(otherTab.getByText(email)).not.toBeVisible();
  await otherTab.close();

  for (const [path, next] of [
    ["/account", "%2Faccount"],
    ["/tos", "%2Ftos"],
    ["/beheer", "%2Fbeheer"],
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${next}$`, "u"));
  }
});

test("veilige accountreturn werkt en kwaadaardige return valt terug op TOS", async ({ page, request }) => {
  const accountEmail = testEmail("participant-account");
  await page.goto("/login?next=/account");
  await signIn(page, request, accountEmail);
  await expect(page).toHaveURL(/\/account$/u);

  await page.getByRole("button", { name: "Uitloggen" }).click();
  const safeEmail = testEmail("participant-safe");
  await page.goto("/login?next=https%3A%2F%2Fevil.example%2Fsteal");
  await signIn(page, request, safeEmail);
  await expect(page).toHaveURL(/\/tos$/u);
  expect(page.url()).not.toContain("evil.example");
});

test("admin-member heeft participant- en beheercontext in één sessie", async ({ page, request }) => {
  const email = testEmail("admin-member");
  await page.goto("/login?next=/beheer");
  await signIn(page, request, email);
  await expect(page).toHaveURL(/\/beheer$/u);
  await expect(page.getByText("Admin").first()).toBeVisible();
  await page.goto("/tos");
  await expect(page.getByRole("heading", { name: "TOS-avonden", level: 1 })).toBeVisible();
  await expect(page.getByText("Clublid goedgekeurd")).toHaveCount(0);
  await openNavigationIfCollapsed(page);
  await expect(page.locator('a[href="/beheer"]:visible')).toHaveText("Beheer");
});

test("admin zonder member behoudt beheer en ziet gesloten membershipstatus", async ({ page, request }) => {
  const email = testEmail("admin-no-member");
  await page.goto("/login?next=/beheer");
  await signIn(page, request, email);
  await expect(page).toHaveURL(/\/beheer$/u);
  await expect(page.getByRole("heading", { name: "Beheeromgeving" })).toBeVisible();
  await openNavigationIfCollapsed(page);
  await page.locator('a[href="/tos"]:visible').click();
  await expect(page).toHaveURL(/\/tos$/u);
  await expect(page.getByRole("heading", { name: "Maak je clubprofiel aan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clubprofiel aanmaken" })).toBeVisible();
  await openNavigationIfCollapsed(page);
  await expect(page.locator('a[href="/beheer"]:visible')).toHaveText("Beheer");
});
