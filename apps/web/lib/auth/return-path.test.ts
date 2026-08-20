import { describe, expect, it } from "vitest";

import {
  ALLOWED_RETURN_PATHS,
  DEFAULT_RETURN_PATH,
  loginPathFor,
  sanitizeReturnPath,
} from "./return-path";

describe("safe Auth return paths", () => {
  it.each(ALLOWED_RETURN_PATHS)("accepts the internal path %s", (path) => {
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
    "/tos/unknown",
    "/unknown",
  ])("fails closed for %s", (value) => {
    expect(sanitizeReturnPath(value)).toBe(DEFAULT_RETURN_PATH);
  });

  it("builds one encoded internal login target", () => {
    expect(loginPathFor("/account")).toBe("/login?next=%2Faccount");
  });
});
