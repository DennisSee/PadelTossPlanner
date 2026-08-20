import { describe, expect, it, vi } from "vitest";

const loadCurrentAccountContext = vi.hoisted(() => vi.fn());

vi.mock("./session", () => ({
  loadCurrentAccountContext,
  destinationForAccount: (
    next: string,
    account: { capabilities: { canPlan: boolean } },
  ) => next === "/beheer" && !account.capabilities.canPlan ? "/tos" : next,
}));

import { finalizeAuthenticatedRequest } from "./finalize";

const APP_BASE_URL = "https://test-tos.oddbounce.nl";

describe("shared server-side Auth finalization", () => {
  it("uses the same account capability destination for OTP and OAuth", async () => {
    loadCurrentAccountContext.mockResolvedValueOnce({
      capabilities: { canPlan: false },
    });
    const participant = await finalizeAuthenticatedRequest(
      "/beheer",
      APP_BASE_URL,
    );
    expect(participant.status).toBe(303);
    expect(participant.headers.get("Location")).toBe(`${APP_BASE_URL}/tos`);
    expect(participant.headers.get("Cache-Control")).toContain("no-store");

    loadCurrentAccountContext.mockResolvedValueOnce({
      capabilities: { canPlan: true },
    });
    const planner = await finalizeAuthenticatedRequest("/beheer", APP_BASE_URL);
    expect(planner.headers.get("Location")).toBe(`${APP_BASE_URL}/beheer`);
  });

  it("fails closed to the supplied safe login path when account loading fails", async () => {
    loadCurrentAccountContext.mockRejectedValueOnce(
      new Error("private repository detail"),
    );
    const response = await finalizeAuthenticatedRequest(
      "/account",
      APP_BASE_URL,
      "/login?error=oauth&next=%2Faccount",
    );
    expect(response.headers.get("Location")).toBe(
      `${APP_BASE_URL}/login?error=oauth&next=%2Faccount`,
    );
    expect(response.headers.get("Location")).not.toContain("private");
  });
});
