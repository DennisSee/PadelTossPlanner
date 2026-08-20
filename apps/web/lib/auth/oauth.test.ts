import { describe, expect, it } from "vitest";

import {
  buildOAuthCallbackUrl,
  GOOGLE_AUTH_ERROR_MESSAGE,
  isPlausibleOAuthCode,
  isPlausiblePkceFlowId,
  isSameOriginOAuthCallback,
  oauthFailurePath,
} from "./oauth";

describe("Google OAuth boundary helpers", () => {
  it.each([
    [undefined, "/tos"],
    ["/account", "/account"],
    ["/beheer", "/beheer"],
    ["/live", "/live"],
    ["https://evil.example/steal", "/tos"],
    ["//evil.example/steal", "/tos"],
    ["%2F%2Fevil.example", "/tos"],
    ["/unknown", "/tos"],
  ])("builds one same-origin callback for %s", (requested, expected) => {
    const result = buildOAuthCallbackUrl(
      "https://test-tos.oddbounce.nl",
      requested,
    );
    expect(result.next).toBe(expected);
    const callback = new URL(result.callbackUrl);
    expect(callback.origin).toBe("https://test-tos.oddbounce.nl");
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("next")).toBe(expected);
    expect([...callback.searchParams.keys()]).toEqual(["next"]);
  });

  it("accepts only the exact runtime callback origin and shape", () => {
    expect(isSameOriginOAuthCallback(
      "https://test-tos.oddbounce.nl/auth/callback?next=%2Faccount",
      "https://test-tos.oddbounce.nl",
    )).toBe(true);
    for (const callback of [
      "https://evil.example/auth/callback?next=%2Faccount",
      "//evil.example/auth/callback?next=%2Faccount",
      "https://test-tos.oddbounce.nl/auth/callback?next=https%3A%2F%2Fevil.example",
      "https://test-tos.oddbounce.nl/auth/callback?next=%2Faccount&extra=1",
      "https://user:pass@test-tos.oddbounce.nl/auth/callback?next=%2Faccount",
      "https://test-tos.oddbounce.nl/other?next=%2Faccount",
    ]) {
      expect(isSameOriginOAuthCallback(
        callback,
        "https://test-tos.oddbounce.nl",
      )).toBe(false);
    }
  });

  it("bounds callback codes without interpreting or logging them", () => {
    expect(isPlausibleOAuthCode("fixture-code_123.abc~def")).toBe(true);
    expect(isPlausibleOAuthCode(null)).toBe(false);
    expect(isPlausibleOAuthCode("")).toBe(false);
    expect(isPlausibleOAuthCode("code\r\nnext")).toBe(false);
    expect(isPlausibleOAuthCode("x".repeat(4_097))).toBe(false);
  });

  it("accepts only the official bounded PKCE flow-id shape", () => {
    expect(isPlausiblePkceFlowId("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isPlausiblePkceFlowId(null)).toBe(false);
    expect(isPlausiblePkceFlowId("short")).toBe(false);
    expect(isPlausiblePkceFlowId("bad.flow.id")).toBe(false);
    expect(isPlausiblePkceFlowId("x".repeat(65))).toBe(false);
  });

  it("uses one limited safe OAuth error category", () => {
    expect(oauthFailurePath("/account")).toBe(
      "/login?error=oauth&next=%2Faccount",
    );
    expect(GOOGLE_AUTH_ERROR_MESSAGE).toBe(
      "Inloggen met Google is niet gelukt. Probeer het opnieuw of gebruik een e-mailcode.",
    );
  });
});
