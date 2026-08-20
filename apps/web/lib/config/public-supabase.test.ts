import { describe, expect, it } from "vitest";

import {
  PublicConfigurationError,
  readAppBaseUrl,
  readAppEnvironment,
  readAppRuntimeConfig,
  readPublicSupabaseConfig,
} from "./public-supabase";

describe("public runtime configuration", () => {
  it("accepts only HTTPS plus a publishable key", () => {
    expect(readPublicSupabaseConfig({
      SUPABASE_URL: "https://test.example.test/",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
    })).toEqual({
      url: "https://test.example.test",
      publishableKey: "sb_publishable_example",
    });
  });

  it("accepts plain HTTP only for a local test server", () => {
    expect(readPublicSupabaseConfig({
      SUPABASE_URL: "http://127.0.0.1:54391",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_only",
    })).toEqual({
      url: "http://127.0.0.1:54391",
      publishableKey: "sb_publishable_e2e_only",
    });

    expect(() => readPublicSupabaseConfig({
      SUPABASE_URL: "http://supabase.invalid",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_only",
    })).toThrow(PublicConfigurationError);
  });

  it("fails safely without echoing missing or secret configuration", () => {
    expect(() => readPublicSupabaseConfig({})).toThrow(PublicConfigurationError);
    expect(() => readPublicSupabaseConfig({
      SUPABASE_URL: "https://test.example.test",
      SUPABASE_PUBLISHABLE_KEY: "sb_secret_forbidden",
    })).toThrow("De publieke schemaconfiguratie is niet beschikbaar.");
  });

  it("shows the staging badge only for the explicit staging environment", () => {
    expect(readAppEnvironment({ APP_ENV: "staging" })).toBe("staging");
    expect(readAppEnvironment({ APP_ENV: "unknown" })).toBe("production");
  });

  it("validates the server-runtime application origin without build-time variables", () => {
    expect(readAppBaseUrl({
      APP_ENV: "staging",
      APP_BASE_URL: "https://test-tos.oddbounce.nl/",
    })).toBe("https://test-tos.oddbounce.nl");
    expect(readAppBaseUrl({ APP_ENV: "test", APP_BASE_URL: "http://127.0.0.1:31000" }))
      .toBe("http://127.0.0.1:31000");
    expect(readAppBaseUrl({ APP_ENV: "staging", APP_BASE_URL: "http://localhost:31000" }))
      .toBe("http://localhost:31000");
    expect(() => readAppBaseUrl({ APP_ENV: "staging", APP_BASE_URL: "http://test-tos.oddbounce.nl" }))
      .toThrow(PublicConfigurationError);
    expect(() => readAppBaseUrl({ APP_ENV: "staging", APP_BASE_URL: "https://evil.test/path" }))
      .toThrow(PublicConfigurationError);
  });

  it("combines only the three approved runtime values", () => {
    expect(readAppRuntimeConfig({
      APP_ENV: "staging",
      APP_BASE_URL: "https://test-tos.oddbounce.nl",
      SUPABASE_URL: "https://test.example.test",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
    })).toEqual({
      appBaseUrl: "https://test-tos.oddbounce.nl",
      url: "https://test.example.test",
      publishableKey: "sb_publishable_example",
    });
  });
});
