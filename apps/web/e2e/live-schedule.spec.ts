import { expect, test, type Page } from "@playwright/test";

const PLAYER_PREFERENCE_KEY = "tc-zuid-tos/preferred-player";
const XSS_NAME = "<img src=x onerror=alert(1)>";
const LONG_PLAYER_NAME = "Alexandria van den Berg-van der Meer met een bijzonder lange testnaam";
const LONG_COURT_NAME = "Seppworks/Bax Baan met een bijzonder lange sponsornaam";
const MOCK_URL = "http://127.0.0.1:45391";

async function openLive(page: Page) {
  const response = await page.goto("/live");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 2, name: "Wedstrijdschema" })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test("homepage toont de publieke stagingingang en navigeert met toetsenbord", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("img", { name: "Logo T.C. Zuid" })).toBeVisible();
  await expect(page.getByText("T.C. Zuid TOS", { exact: true })).toBeVisible();
  await expect(page.getByText("Staging", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Jouw TOS-avond in één oogopslag",
  );
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(
    "Doe mee met de volgende TOS",
  );
  await expect(
    page
      .getByRole("heading", { name: "Doe mee met de volgende TOS" })
      .locator("..")
      .getByRole("link", { name: "Inloggen / aanmelden" }),
  ).toBeVisible();

  const liveLink = page.getByRole("link", { name: "Bekijk live TOS-schema" });
  await liveLink.focus();
  await expect(liveLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/live$/);
});

test("mock weigert een wildcard of afwijkend publiek querycontract", async ({ request }) => {
  const response = await request.get(
    `${MOCK_URL}/rest/v1/schedules?select=*&is_published=eq.true&order=event_date.desc&limit=1`,
  );
  expect(response.status()).toBe(422);
  await expect(response.json()).resolves.toEqual({
    error: "public schedule query contract rejected",
  });
});

test("iedereenweergave toont event, rondes, banen, teams en statussen", async ({ page }) => {
  await openLive(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/12 deelnemers/)).toBeVisible();
  const select = page.getByLabel("Kies je naam");
  await expect(select).toBeVisible();
  await expect(select).toHaveValue("Iedereen");
  await expect(page.locator('[data-selected-player="true"]')).toHaveCount(0);

  const current = page.getByRole("region", { name: "Huidige ronde" });
  const next = page.getByRole("region", { name: "Volgende ronde" });
  await expect(current).toBeVisible();
  await expect(next).toBeVisible();
  await expect(current.getByText(LONG_COURT_NAME, { exact: true })).toBeVisible();
  await expect(current.getByText("Kremer Baan", { exact: true })).toBeVisible();
  await expect(current.getByText("Zoë Accent", { exact: true })).toBeVisible();
  await expect(current.getByText("Anna", { exact: true }).first()).toBeVisible();
  await expect(current.getByText(/Rust: Rust Speler, Ann/)).toBeVisible();
  await expect(current.getByText(/Nog niet aanwezig: Nog Niet Speler/)).toBeVisible();
  await expect(next.getByText(/Niet meer beschikbaar: Niet Meer Speler/)).toBeVisible();

  const participants = page.getByText(/^Deelnemers \(12\)$/);
  await participants.click();
  await expect(participants.locator("..").getByText(LONG_PLAYER_NAME, { exact: true })).toBeVisible();
});

test("persoonlijke selectie onderscheidt teams, rust, afwezigheid en exacte namen", async ({ page }) => {
  await openLive(page);
  const select = page.getByLabel("Kies je naam");
  const current = page.getByRole("region", { name: "Huidige ronde" });
  const next = page.getByRole("region", { name: "Volgende ronde" });

  await select.selectOption({ label: "Zoë Accent" });
  await expect(page.getByRole("heading", { level: 2, name: "Schema voor Zoë Accent" })).toBeVisible();
  await expect(current.getByRole("heading", { level: 3 })).toHaveCount(1);
  await expect(next.getByRole("heading", { level: 3 })).toHaveCount(1);
  await expect(current.getByText("Zoë Accent", { exact: true })).toBeVisible();
  await expect(current.getByText(LONG_PLAYER_NAME, { exact: true })).toBeVisible();
  const selectedHighlights = page.locator('[data-selected-player="true"]');
  expect(await selectedHighlights.count()).toBeGreaterThan(0);
  await expect(selectedHighlights.first()).toContainText("Zoë Accent");
  await expect(selectedHighlights.first()).toContainText("jij");

  const playingCard = current.getByTestId("court-badge").first().locator("..").locator("..");
  const playingBox = await playingCard.boundingBox();

  await select.selectOption({ label: "Rust Speler" });
  const restState = current.locator('[data-personal-status="rest"]');
  await expect(restState).toContainText("Rust");
  await expect(restState).toContainText("Deze ronde speel je niet.");
  const restBox = await restState.locator("..").boundingBox();
  expect(restBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(
    playingBox?.height ?? 0,
  );
  await select.selectOption({ label: "Nog Niet Speler" });
  await expect(current.getByText("Je bent deze ronde nog niet beschikbaar.")).toBeVisible();
  await select.selectOption({ label: "Niet Meer Speler" });
  await expect(next.getByText("Deze ronde valt na jouw eindtijd.")).toBeVisible();

  await select.selectOption({ label: "Ann" });
  await expect(current.getByText("Deze ronde speel je niet.")).toBeVisible();
  await expect(page.locator('[data-selected-player="true"]')).toHaveCount(0);
});

test("geldige, verouderde en same-tab localStoragevoorkeuren blijven veilig", async ({ page }) => {
  await openLive(page);
  const select = page.getByLabel("Kies je naam");
  await select.selectOption({ label: "Zoë Accent" });
  await expect(select).toHaveValue("Zoë Accent");
  await page.reload();
  await expect(page.getByLabel("Kies je naam")).toHaveValue("Zoë Accent");

  await page.evaluate(([key]) => window.localStorage.setItem(key, "Oude Onbekende Speler"), [
    PLAYER_PREFERENCE_KEY,
  ]);
  await page.reload();
  await expect(page.getByLabel("Kies je naam")).toHaveValue("Iedereen");
});

test("geblokkeerde localStorage-getter laat de select bruikbaar", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("storage denied", "SecurityError");
    };
  });
  await openLive(page);
  const select = page.getByLabel("Kies je naam");
  await select.selectOption({ label: "Zoë Accent" });
  await expect(select).toHaveValue("Zoë Accent");
});

test("geblokkeerde localStorage-setter laat same-tab selectie bruikbaar", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("storage denied", "SecurityError");
    };
  });
  await openLive(page);
  const select = page.getByLabel("Kies je naam");
  await select.selectOption({ label: "Rust Speler" });
  await expect(select).toHaveValue("Rust Speler");
  await expect(page.getByRole("region", { name: "Huidige ronde" })).toContainText(
    "Deze ronde speel je niet.",
  );
});

test("databaseachtige XSS-tekst blijft tekst en voert niets uit", async ({ page }) => {
  let dialogOpened = false;
  page.on("dialog", async (dialog) => {
    dialogOpened = true;
    await dialog.dismiss();
  });
  await openLive(page);
  const participants = page.getByText(/^Deelnemers \(12\)$/);
  await participants.click();
  await expect(participants.locator("..").getByText(XSS_NAME, { exact: true })).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(dialogOpened).toBe(false);
});

test("livebediening en documentstructuur zijn met toetsenbord bereikbaar", async ({ page }) => {
  await openLive(page);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Wedstrijdschema" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 }).first()).toBeVisible();

  const select = page.getByLabel("Kies je naam");
  await select.focus();
  await expect(select).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(select).not.toHaveValue("Iedereen");

  const participantSummary = page.getByText(/^Deelnemers \(12\)$/);
  await participantSummary.focus();
  await expect(participantSummary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(participantSummary.locator("..")).toHaveJSProperty("open", true);
});

test("homepage en livepagina blijven binnen iedere geconfigureerde viewport", async ({ page }) => {
  await page.goto("/");
  await expectNoHorizontalOverflow(page);
  const logo = await page.getByRole("img", { name: "Logo T.C. Zuid" }).boundingBox();
  const brand = await page.getByText("T.C. Zuid TOS", { exact: true }).boundingBox();
  expect(logo).not.toBeNull();
  expect(brand).not.toBeNull();
  expect((logo?.x ?? 0) + (logo?.width ?? 0)).toBeLessThanOrEqual((brand?.x ?? 0) + 1);
  const cta = await page.getByRole("link", { name: "Bekijk live TOS-schema" }).boundingBox();
  expect(cta?.height ?? 0).toBeGreaterThanOrEqual(44);

  await openLive(page);
  const participants = page.getByText(/^Deelnemers \(12\)$/);
  await participants.click();
  await expectNoHorizontalOverflow(page);
  const viewport = page.viewportSize();
  const select = await page.getByLabel("Kies je naam").boundingBox();
  const longName = await participants.locator("..").getByText(LONG_PLAYER_NAME, { exact: true }).boundingBox();
  const courtBadge = page.getByTestId("court-badge").filter({ hasText: LONG_COURT_NAME }).first();
  const longCourt = await courtBadge.boundingBox();
  const compactCourt = page.getByTestId("court-badge").filter({ hasText: "Kremer Baan" }).first();
  const compactCourtBox = await compactCourt.boundingBox();
  const courtMatch = await compactCourt.locator("..").boundingBox();
  const eventSummary = await page.getByTestId("event-summary").boundingBox();
  const eventStatus = await page.getByTestId("event-status").boundingBox();
  expect(select).not.toBeNull();
  expect(longName).not.toBeNull();
  expect(longCourt).not.toBeNull();
  expect((select?.x ?? 0) + (select?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
  expect((longName?.x ?? 0) + (longName?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
  expect((longCourt?.x ?? 0) + (longCourt?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
  expect(compactCourtBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThan(courtMatch?.width ?? 0);
  const eventOverlaps = Boolean(
    eventSummary && eventStatus &&
    eventSummary.x < eventStatus.x + eventStatus.width &&
    eventSummary.x + eventSummary.width > eventStatus.x &&
    eventSummary.y < eventStatus.y + eventStatus.height &&
    eventSummary.y + eventSummary.height > eventStatus.y
  );
  expect(eventOverlaps).toBe(false);
});

test("reduced motion schakelt de skeletonanimatie structureel uit", async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const control = await request.post(`${MOCK_URL}/__delay?milliseconds=1200`);
  expect(control.ok()).toBe(true);

  const navigation = page.goto("/live");
  const loading = page.getByRole("main", { name: "Live schema laden" });
  await expect(loading).toBeVisible();
  const animationName = await loading.locator("section").evaluate(
    (element) => window.getComputedStyle(element).animationName,
  );
  expect(animationName).toBe("none");
  await navigation;
  await expect(page.getByRole("heading", { level: 2, name: "Wedstrijdschema" })).toBeVisible();
});
