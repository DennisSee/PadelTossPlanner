import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const updateRole = vi.hoisted(() => vi.fn());
vi.mock("../../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../../lib/tos/staff-member-repository", () => ({ StaffMemberRepository: class { updateRole = updateRole; } }));
import { POST } from "./route";

const BASE = "https://app.example";
const ACTOR = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";
function request(fields: Record<string, string>, origin: string | null = BASE) { const form = new FormData(); for (const [key,value] of Object.entries(fields)) form.set(key,value); return new NextRequest(`${BASE}/api/beheer/leden/role`, { method: "POST", headers: origin ? { origin } : undefined, body: form }); }
const admin = { identity: { userId: ACTOR }, profile: { active: true }, capabilities: { canAdminister: true } };

describe("admin account-role POST boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); readAppBaseUrl.mockReturnValue(BASE); createServerSupabaseClient.mockResolvedValue({}); loadAccountContextWithClient.mockResolvedValue(admin); updateRole.mockImplementation(async (write) => write); });
  it("lets an active admin change only another linked profile role", async () => {
    const response = await POST(request({ profile_id: TARGET, role: "planner" }));
    expect(updateRole).toHaveBeenCalledWith({ profileId: TARGET, role: "planner" });
    expect(response.headers.get("location")).toBe(`${BASE}/beheer/leden?notice=account-role-updated`);
  });
  it("blocks self-demotion and participant/staff non-admin sessions", async () => {
    expect((await POST(request({ profile_id: ACTOR, role: "participant" }))).headers.get("location")).toContain("not-authorized");
    loadAccountContextWithClient.mockResolvedValueOnce({ ...admin, capabilities: { canAdminister: false } });
    expect((await POST(request({ profile_id: TARGET, role: "admin" }))).headers.get("location")).toContain("not-authorized");
    expect(updateRole).not.toHaveBeenCalled();
  });
  it.each(["member_id", "approval_status", "active", "email"])("rejects forged field %s before Auth", async (field) => {
    await POST(request({ profile_id: TARGET, role: "planner", [field]: "attacker" }));
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
  it("checks exact Origin before Auth", async () => {
    expect((await POST(request({ profile_id: TARGET, role: "planner" }, "https://evil.example"))).status).toBe(403);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
});
