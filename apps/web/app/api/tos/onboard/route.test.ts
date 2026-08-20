import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const selfOnboard = vi.hoisted(() => vi.fn());

vi.mock("../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../lib/tos/repository", () => ({
  TosRepository: class {
    selfOnboard = selfOnboard;
  },
}));

import { POST } from "./route";

const APP_BASE_URL = "https://app.example";
const client = Object.freeze({ client: "same-request-client" });

function account(overrides: Record<string, unknown> = {}) {
  return {
    identity: { userId: "user-1", email: "member@example.test" },
    profile: { displayName: "Dennis", role: "planner", active: true, memberId: null },
    membership: { state: "missing", memberId: null, displayName: null },
    capabilities: { canParticipate: false, canPlan: true, canAdminister: false },
    ...overrides,
  };
}

function request(fields: Record<string, string>, origin: string | null = APP_BASE_URL) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const headers = origin ? { origin } : undefined;
  return new NextRequest(`${APP_BASE_URL}/api/tos/onboard`, { method: "POST", headers, body: form });
}

describe("self-onboarding POST boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAppBaseUrl.mockReturnValue(APP_BASE_URL);
    createServerSupabaseClient.mockResolvedValue(client);
    selfOnboard.mockResolvedValue(undefined);
    loadAccountContextWithClient
      .mockResolvedValueOnce(account())
      .mockResolvedValueOnce(account({
        membership: { state: "approved", memberId: "member-1", displayName: "Dennis" },
        capabilities: { canParticipate: true, canPlan: true, canAdminister: false },
      }));
  });

  it("uses one client, one identity-free RPC input and preserves role", async () => {
    const response = await POST(request({ display_name: "  Dennis Seesing  ", slug: "vrijdag-padel" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/tos/vrijdag-padel?notice=profile-created`);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(loadAccountContextWithClient).toHaveBeenNthCalledWith(1, client);
    expect(loadAccountContextWithClient).toHaveBeenNthCalledWith(2, client);
    expect(selfOnboard).toHaveBeenCalledWith("Dennis Seesing");
  });

  it.each([null, "https://evil.example"])("rejects origin %s before Auth", async (origin) => {
    const response = await POST(request({ display_name: "Dennis" }, origin));
    expect(response.status).toBe(403);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("rejects unexpected authority fields", async () => {
    const response = await POST(request({ display_name: "Dennis", role: "admin" }));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/tos?error=invalid-request`);
    expect(selfOnboard).not.toHaveBeenCalled();
  });

  it("never offers mutation authority to an inactive profile, even in a contradictory missing state", async () => {
    loadAccountContextWithClient.mockReset();
    loadAccountContextWithClient.mockResolvedValueOnce(account({
      profile: { displayName: "Dennis", role: "admin", active: false, memberId: null },
    }));
    const response = await POST(request({ display_name: "Dennis" }));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/tos?error=not-authorized`);
    expect(selfOnboard).not.toHaveBeenCalled();
  });

  it("sends an anonymous request to the same internal return path", async () => {
    loadAccountContextWithClient.mockReset();
    loadAccountContextWithClient.mockResolvedValueOnce(null);
    const response = await POST(request({ display_name: "Dennis", slug: "vrijdag-padel" }));
    expect(response.headers.get("location")).toBe(
      `${APP_BASE_URL}/login?next=%2Ftos%2Fvrijdag-padel`,
    );
  });

  it("fails configuration and RPC details safely", async () => {
    readAppBaseUrl.mockImplementationOnce(() => { throw new Error("private config"); });
    const unavailable = await POST(request({ display_name: "Dennis" }));
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).toBe("Clubprofiel tijdelijk niet beschikbaar.");

    loadAccountContextWithClient.mockReset();
    loadAccountContextWithClient.mockResolvedValueOnce(account());
    selfOnboard.mockRejectedValueOnce(new Error("raw SQL and token detail"));
    const rpcFailure = await POST(request({ display_name: "Dennis" }));
    expect(rpcFailure.headers.get("location")).toBe(`${APP_BASE_URL}/tos?error=temporarily-unavailable`);
    expect(rpcFailure.headers.get("location")).not.toMatch(/SQL|token/u);
  });
});
