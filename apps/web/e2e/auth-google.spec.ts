import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const AUTH_VIEWPORTS = new Set(["phone-390", "desktop-1440"]);
const MOCK_URL = "http://127.0.0.1:45391";

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    !AUTH_VIEWPORTS.has(testInfo.project.name),
    "Google Authflow is gericht op 390px en 1440px.",
  );
});

function testEmail(prefix: string) {
  return `${prefix}-${randomUUID()}@example.test`;
}

async function configureGoogle(
  request: APIRequestContext,
  email: string,
  outcome: "success" | "cancel" | "exchange-error" = "success",
) {
  const response = await request.post(`${MOCK_URL}/__test/oauth`, {
    data: { email, outcome },
  });
  expect(response.ok()).toBe(true);
}

async function startGoogle(page: Page) {
  await page.getByRole("button", { name: "Doorgaan met Google" }).click();
}

async function logout(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: "Uitloggen" }).click();
  await expect(page).toHaveURL(/\/$/u);
}

async function latestOtp(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post(`${MOCK_URL}/__test/latest-otp`, {
    data: { email },
  });
  expect(response.ok()).toBe(true);
  return String((await response.json()).token);
}

async function signInWithOtp(
  page: Page,
  request: APIRequestContext,
  email: string,
) {
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByRole("button", { name: "Stuur mij een inlogcode" }).click();
  const token = await latestOtp(request, email);
  await page.getByLabel("Inlogcode").fill(token);
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
}

async function authCookies(page: Page) {
  return (await page.context().cookies()).filter(
    ({ name }) => name.startsWith("sb-") && name.includes("-auth-token"),
  );
}

test("Google login gebruikt PKCE, dezelfde sessie en de ingelogde homepage", async ({
  page,
  request,
}) => {
  const email = testEmail("google-participant");
  await configureGoogle(request, email);
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Inloggen / aanmelden" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Doorgaan met Google" })).toBeVisible();
  const emailInput = page.getByLabel("E-mailadres");
  await expect(emailInput).toHaveAttribute("id", "email");
  await expect(emailInput).toHaveAttribute("name", "email");
  await expect(emailInput).toHaveAttribute("type", "email");
  await expect(emailInput).toHaveAttribute("autocomplete", "email");
  await expect(emailInput).toHaveAttribute("inputmode", "email");
  await expect(emailInput).toHaveAttribute("autocapitalize", "none");
  await expect(emailInput).toHaveAttribute("spellcheck", "false");
  await expect(emailInput).toHaveAttribute("enterkeyhint", "send");

  const authorizeRequest = page.waitForRequest((candidate) =>
    candidate.url().includes("/auth/v1/authorize?"),
  );
  await startGoogle(page);
  const authorize = new URL((await authorizeRequest).url());
  expect(authorize.searchParams.get("provider")).toBe("google");
  expect(authorize.searchParams.get("scopes")).toBeNull();
  expect(authorize.searchParams.get("access_type")).toBeNull();
  expect(authorize.searchParams.get("code_challenge_method")).toBe("s256");
  expect(new URL(authorize.searchParams.get("redirect_to") ?? "").origin).toBe(
    "http://127.0.0.1:31000",
  );

  await expect(page).toHaveURL(/\/tos$/u);
  expect(page.url()).not.toMatch(/code=|error_description|access_token/u);
  const cookies = await authCookies(page);
  expect(cookies.length).toBeGreaterThan(0);
  for (const cookie of cookies) {
    expect(cookie.domain).toBe("127.0.0.1");
    expect(cookie.path).toBe("/");
    expect(cookie.sameSite).toBe("Lax");
    expect(cookie.secure).toBe(false);
  }
  expect(cookies.filter(({ name }) => name.includes("code-verifier"))).toHaveLength(0);

  await page.reload();
  await expect(page).toHaveURL(/\/tos$/u);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bekijk je TOS-avonden" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Naar TOS-avonden" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Inloggen / aanmelden" })).toHaveCount(0);
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);

  await logout(page);
  expect(await authCookies(page)).toHaveLength(0);
  await page.goto("/tos");
  await expect(page).toHaveURL(/\/login\?next=%2Ftos$/u);
});

test("Google returnroutes hergebruiken participant- en staffcapabilities", async ({
  page,
  request,
}) => {
  await configureGoogle(request, testEmail("google-account"));
  await page.goto("/login?next=/account");
  await startGoogle(page);
  await expect(page).toHaveURL(/\/account$/u);
  await logout(page);

  await configureGoogle(request, testEmail("google-participant-manage"));
  await page.goto("/login?next=/beheer");
  await startGoogle(page);
  await expect(page).toHaveURL(/\/tos$/u);
  await logout(page);

  await configureGoogle(request, testEmail("admin-member-google"));
  await page.goto("/login?next=/beheer");
  await startGoogle(page);
  await expect(page).toHaveURL(/\/beheer$/u);
  await expect(page.getByText("Admin").first()).toBeVisible();
  await logout(page);

  await configureGoogle(request, testEmail("google-live"));
  await page.goto("/login?next=/live");
  await startGoogle(page);
  await expect(page).toHaveURL(/\/live$/u);
});

test("Google callback en returninput falen zonder providerdetails veilig gesloten", async ({
  page,
  request,
}) => {
  await configureGoogle(request, testEmail("google-cancel"), "cancel");
  await page.goto("/login?next=/tos");
  await startGoogle(page);
  await expect(page).toHaveURL(/\/login\?error=oauth&next=%2Ftos$/u);
  await expect(page.locator("p[role='alert']")).toHaveText(
    "Inloggen met Google is niet gelukt. Probeer het opnieuw of gebruik een e-mailcode.",
  );
  await expect(page.getByLabel("E-mailadres")).toBeEnabled();
  expect(page.url()).not.toMatch(/access_denied|error_description|provider/u);

  await configureGoogle(request, testEmail("google-exchange"), "exchange-error");
  await page.goto("/login?next=/account");
  await startGoogle(page);
  await expect(page).toHaveURL(/\/login\?error=oauth&next=%2Faccount$/u);

  await configureGoogle(request, testEmail("google-malicious"));
  await page.goto("/login?next=https%3A%2F%2Fevil.example%2Fsteal");
  await startGoogle(page);
  await expect(page).toHaveURL(/\/tos$/u);
  expect(page.url()).not.toContain("evil.example");
});

test("bestaande OTP-identiteit houdt profiel en capabilities bij Google login", async ({
  page,
  request,
}) => {
  const email = testEmail("admin-member-shared");
  await page.goto("/login?next=/account");
  await signInWithOtp(page, request, email);
  await expect(page).toHaveURL(/\/account$/u);
  await expect(page.getByText("Testlid", { exact: true })).toBeVisible();
  await expect(page.getByText("Admin").first()).toBeVisible();
  await logout(page);

  await configureGoogle(request, email);
  await page.goto("/login?next=/account");
  await startGoogle(page);
  await expect(page).toHaveURL(/\/account$/u);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.getByText("Testlid", { exact: true })).toBeVisible();
  await expect(page.getByText("Admin").first()).toBeVisible();
  await expect(page.getByText("Niet gebruiken voor profiel of rollen")).toHaveCount(0);
});
