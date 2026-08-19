import { describe, expect, it } from "vitest";

import {
  PublicConfigurationError,
  readAppEnvironment,
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
});
