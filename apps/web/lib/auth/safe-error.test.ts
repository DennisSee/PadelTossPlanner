import { describe, expect, it } from "vitest";

import { authErrorCategory, safeAuthMessage } from "./safe-error";

describe("safe Auth errors", () => {
  it("maps only safe categories", () => {
    expect(authErrorCategory({ status: 429, message: "upstream detail" })).toBe("rate_limit");
    expect(authErrorCategory({ code: "otp_expired" })).toBe("invalid_token");
    expect(authErrorCategory(new TypeError("Failed to fetch"))).toBe("network");
  });

  it("never includes raw provider details", () => {
    const raw = "sensitive upstream detail";
    for (const category of ["rate_limit", "invalid_token", "network", "configuration", "unavailable"] as const) {
      expect(safeAuthMessage(category)).not.toContain(raw);
      expect(safeAuthMessage(category)).not.toMatch(/token|supabase|provider/i);
    }
  });
});
