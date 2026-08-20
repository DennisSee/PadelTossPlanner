import { describe, expect, it } from "vitest";

import {
  ALLOWED_RETURN_PATHS,
  DEFAULT_RETURN_PATH,
  loginPathFor,
  oauthErrorLoginPath,
  sanitizeReturnPath,
} from "./return-path";

describe("safe Auth return paths", () => {
  it.each(ALLOWED_RETURN_PATHS)("accepts the internal path %s", (path) => {
    expect(sanitizeReturnPath(path)).toBe(path);
  });

  it.each([
    "/tos/vrijdag-padel",
    "/tos/tennis-avond-2026",
    "/tos/unknown",
  ])("accepts the bounded TOS detail path %s", (path) => {
    expect(sanitizeReturnPath(path)).toBe(path);
  });

  it.each([
    undefined,
    null,
    "",
    "https://evil.example/account",
    "//evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/account\r\nLocation: https://evil.example",
    "%2F%2Fevil.example",
    "%2Faccount",
    "/tos/",
    "/tos/ab",
    "/tos/Hoofdletters",
    "/tos/event/extra",
    "/tos/event?query=1",
    "/tos/event#fragment",
    "/tos/%2Fescape",
    "/tos/%5Cescape",
    "/tos/event%252Fextra",
    "/unknown",
  ])("fails closed for %s", (value) => {
    expect(sanitizeReturnPath(value)).toBe(DEFAULT_RETURN_PATH);
  });

  it("builds one encoded internal login target", () => {
    expect(loginPathFor("/account")).toBe("/login?next=%2Faccount");
    expect(oauthErrorLoginPath("/account")).toBe(
      "/login?error=oauth&next=%2Faccount",
    );
    expect(loginPathFor("/tos/vrijdag-padel")).toBe(
      "/login?next=%2Ftos%2Fvrijdag-padel",
    );
  });
});
