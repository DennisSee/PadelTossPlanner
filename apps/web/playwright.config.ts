import { defineConfig } from "@playwright/test";

const MOCK_PORT = 54_391;
const WEB_PORT = 31_000;
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;

const viewports = [
  ["phone-360", 360, 800],
  ["phone-390", 390, 844],
  ["phone-430", 430, 932],
  ["tablet-768", 768, 1024],
  ["desktop-1440", 1440, 900],
] as const;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: viewports.map(([name, width, height]) => ({
    name,
    use: { viewport: { width, height } },
  })),
  webServer: [
    {
      command: `node test-support/mock-public-supabase-server.mjs --port ${MOCK_PORT}`,
      url: `http://127.0.0.1:${MOCK_PORT}/__health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "node test-support/start-standalone-web.mjs",
      url: `${BASE_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...process.env,
        APP_ENV: "staging",
        SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_only",
        HOSTNAME: "127.0.0.1",
        PORT: String(WEB_PORT),
      },
    },
  ],
});
