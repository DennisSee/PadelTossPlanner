import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const updateSportProfile = vi.hoisted(() => vi.fn());

vi.mock("../../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../../lib/tos/staff-member-repository", () => ({
  StaffMemberRepository: class { updateSportProfile = updateSportProfile; },
}));

import { POST } from "./route";

const APP_BASE_URL = "https://app.example";
const MEMBER_ID = "44444444-4444-4444-8444-444444444444";
const client = Object.freeze({ requestScoped: true });

function account(role: "participant" | "planner" | "admin" = "planner", active = true) {
  return {
    identity: { userId: "11111111-1111-4111-8111-111111111111", email: "staff@example.test" },
    profile: { displayName: "Staff", role, active, memberId: null },
    membership: { state: active ? "missing" : "inactive", memberId: null, displayName: null },
    capabilities: { canParticipate: false, canPlan: active && role !== "participant", canAdminister: active && role === "admin" },
  };
}

const fields = { member_id: MEMBER_ID, sport: "padel", active: "true", ranking: "4" };

function request(values: Record<string, string>, origin: string | null = APP_BASE_URL) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return new NextRequest(`${APP_BASE_URL}/api/beheer/leden/sport-profile`, {
    method: "POST",
    headers: origin ? { origin } : undefined,
    body: form,
  });
}

describe("staff sport-profile POST boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAppBaseUrl.mockReturnValue(APP_BASE_URL);
    createServerSupabaseClient.mockResolvedValue(client);
    loadAccountContextWithClient.mockResolvedValue(account());
    updateSportProfile.mockImplementation(async (write) => write);
  });

  it.each(["planner", "admin"] as const)("allows active %s without membership", async (role) => {
    loadAccountContextWithClient.mockResolvedValueOnce(account(role));
    const response = await POST(request(fields));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/beheer/leden?notice=sport-profile-updated`);
    expect(updateSportProfile).toHaveBeenCalledWith({
      memberId: MEMBER_ID,
      sport: "padel",
      active: true,
      ranking: 4,
    });
  });

  it.each([account("participant"), account("planner", false)])(
    "denies participant/inactive staff without a write",
    async (denied) => {
      loadAccountContextWithClient.mockResolvedValueOnce(denied);
      const response = await POST(request(fields));
      expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/beheer/leden?error=not-authorized`);
      expect(updateSportProfile).not.toHaveBeenCalled();
    },
  );

  it.each(["role", "user_id", "email", "approval_status", "member_active"])(
    "rejects forged field %s before Auth",
    async (field) => {
      const response = await POST(request({ ...fields, [field]: "attacker" }));
      expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/beheer/leden?error=invalid-request`);
      expect(createServerSupabaseClient).not.toHaveBeenCalled();
    },
  );

  it.each([null, "https://evil.example"])("rejects Origin %s before Auth", async (origin) => {
    const response = await POST(request(fields, origin));
    expect(response.status).toBe(403);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("does not report success if the defensive RPC result differs", async () => {
    updateSportProfile.mockResolvedValueOnce({ ...fields, memberId: MEMBER_ID, sport: "padel", active: true, ranking: 3 });
    const response = await POST(request(fields));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/beheer/leden?error=temporarily-unavailable`);
  });
});
