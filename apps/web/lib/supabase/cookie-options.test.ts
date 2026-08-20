import { describe, expect, it } from "vitest";

import {
  AuthCookieConfigurationError,
  authCookieOptionsForOrigin,
  browserAuthCookieOptions,
} from "./cookie-options";

describe("Supabase Auth cookie contract", () => {
  it.each([
    "https://test-tos.oddbounce.nl",
    "https://tos.oddbounce.nl",
    "https://example.test:8443",
  ])("uses Secure host-only cookies for HTTPS origin %s", (origin) => {
    const options = authCookieOptionsForOrigin(origin);
    expect(options).toEqual({ path: "/", sameSite: "lax", secure: true });
    expect(options).not.toHaveProperty("domain");
    expect(options).not.toHaveProperty("httpOnly");
    expect(options).not.toHaveProperty("name");
    expect(options).not.toHaveProperty("maxAge");
  });

  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:31000",
    "http://[::1]:3000",
  ])("keeps local HTTP development usable for %s", (origin) => {
    expect(authCookieOptionsForOrigin(origin)).toEqual({
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });

  it.each([
    "http://test-tos.oddbounce.nl",
    "http://example.test",
    "https://user:password@example.test",
    "https://example.test/path",
    "//example.test",
  ])("fails closed for unsafe or non-origin value %s", (origin) => {
    expect(() => authCookieOptionsForOrigin(origin)).toThrow(
      AuthCookieConfigurationError,
    );
  });

  it("derives the browser contract from the runtime origin", () => {
    expect(browserAuthCookieOptions("https://test-tos.oddbounce.nl")).toEqual({
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(browserAuthCookieOptions("http://localhost:3000")).toEqual({
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });
});
