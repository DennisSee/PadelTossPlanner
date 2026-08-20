import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.hoisted(() => vi.fn());
const readAppBaseUrl = vi.hoisted(() => vi.fn());
const loadCurrentAccountContext = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    auth: { exchangeCodeForSession },
  }),
}));
vi.mock("../../../lib/auth/session", () => ({
  loadCurrentAccountContext,
  destinationForAccount: (
    next: string,
    account: { capabilities: { canPlan: boolean } },
  ) => next === "/beheer" && !account.capabilities.canPlan ? "/tos" : next,
}));

import { GET } from "./route";

const APP_BASE_URL = "https://test-tos.oddbounce.nl";

function request(query: string) {
  return new NextRequest(`${APP_BASE_URL}/auth/callback?${query}`);
}

const FLOW = "0123456789abcdef0123456789abcdef";

describe("Google OAuth callback", () => {
  beforeEach(() => {
    readAppBaseUrl.mockReset();
    exchangeCodeForSession.mockReset();
    loadCurrentAccountContext.mockReset();
    readAppBaseUrl.mockReturnValue(APP_BASE_URL);
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    loadCurrentAccountContext.mockResolvedValue({
      capabilities: { canPlan: false },
    });
  });

  it("awaits the code exchange and then reuses account finalization", async () => {
    let finishExchange!: (value: { data: object; error: null }) => void;
    exchangeCodeForSession.mockReturnValueOnce(
      new Promise((resolve) => {
        finishExchange = resolve;
      }),
    );
    const pending = GET(
      request(`code=fixture-code&sb_flow_id=${FLOW}&next=%2Faccount`),
    );
    await Promise.resolve();
    expect(exchangeCodeForSession).toHaveBeenCalledWith("fixture-code", {
      flowId: FLOW,
    });
    expect(loadCurrentAccountContext).not.toHaveBeenCalled();
    finishExchange({ data: {}, error: null });
    const response = await pending;
    expect(loadCurrentAccountContext).toHaveBeenCalledTimes(1);
    expect(response.headers.get("Location")).toBe(`${APP_BASE_URL}/account`);
    expect(response.headers.get("Location")).not.toContain("fixture-code");
  });

  it("allows management only after the existing capability decision", async () => {
    const participant = await GET(
      request(`code=fixture-code&sb_flow_id=${FLOW}&next=%2Fbeheer`),
    );
    expect(participant.headers.get("Location")).toBe(`${APP_BASE_URL}/tos`);

    loadCurrentAccountContext.mockResolvedValueOnce({
      capabilities: { canPlan: true },
    });
    const planner = await GET(
      request(`code=fixture-code&sb_flow_id=${FLOW}&next=%2Fbeheer`),
    );
    expect(planner.headers.get("Location")).toBe(`${APP_BASE_URL}/beheer`);
  });

  it("preserves one validated dynamic TOS event return", async () => {
    const response = await GET(
      request(`code=fixture-code&sb_flow_id=${FLOW}&next=%2Ftos%2Fvrijdag-padel`),
    );
    expect(response.headers.get("Location")).toBe(
      `${APP_BASE_URL}/tos/vrijdag-padel`,
    );
  });

  it.each([
    `code=fixture-code&sb_flow_id=${FLOW}&next=https%3A%2F%2Fevil.example`,
    `code=fixture-code&sb_flow_id=${FLOW}&next=%2F%2Fevil.example`,
    `code=fixture-code&sb_flow_id=${FLOW}&next=%252F%252Fevil.example`,
    `code=fixture-code&sb_flow_id=${FLOW}&next=%2Funknown`,
    `code=fixture-code&sb_flow_id=${FLOW}&next=%2Faccount%0D%0ALocation%3Ahttps%3A%2F%2Fevil.example`,
    `code=fixture-code&sb_flow_id=${FLOW}&next=%5C%5Cevil.example`,
  ])("fails unsafe return input closed to TOS: %s", async (query) => {
    const response = await GET(request(query));
    expect(response.headers.get("Location")).toBe(`${APP_BASE_URL}/tos`);
  });

  it.each([
    "next=%2Ftos",
    "code=&next=%2Ftos",
    "code=bad%0Acode&next=%2Ftos",
    "code=fixture-code&next=%2Ftos",
    "code=fixture-code&sb_flow_id=invalid.flow&next=%2Ftos",
    "error=access_denied&error_description=raw-private-provider-detail&next=%2Ftos",
  ])("returns one safe provider error for an invalid callback: %s", async (query) => {
    const response = await GET(request(query));
    const location = response.headers.get("Location") ?? "";
    expect(location).toBe(
      `${APP_BASE_URL}/login?error=oauth&next=%2Ftos`,
    );
    expect(location).not.toMatch(/provider-detail|access_denied|code=/u);
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("uses the same safe error for exchange and account-context failures", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({
      data: null,
      error: { message: "raw Supabase exchange detail" },
    });
    const exchangeFailure = await GET(
      request(`code=fixture-code&sb_flow_id=${FLOW}&next=%2Faccount`),
    );
    expect(exchangeFailure.headers.get("Location")).toBe(
      `${APP_BASE_URL}/login?error=oauth&next=%2Faccount`,
    );

    loadCurrentAccountContext.mockResolvedValueOnce(null);
    const missingProfile = await GET(
      request(`code=fixture-code&sb_flow_id=${FLOW}&next=%2Faccount`),
    );
    expect(missingProfile.headers.get("Location")).toBe(
      `${APP_BASE_URL}/login?error=oauth&next=%2Faccount`,
    );
  });

  it("fails configuration errors without echoing configuration", async () => {
    readAppBaseUrl.mockImplementationOnce(() => {
      throw new Error("private runtime configuration");
    });
    const response = await GET(
      request(`code=fixture-code&sb_flow_id=${FLOW}&next=%2Ftos`),
    );
    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe(
      "Inloggen is tijdelijk niet beschikbaar.",
    );
  });
});
