import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());
const deleteMember = vi.hoisted(() => vi.fn());
vi.mock("../../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../../lib/tos/staff-member-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../lib/tos/staff-member-repository")>();
  return { ...actual, StaffMemberRepository: class { list = list; deleteMember = deleteMember; } };
});
import { POST } from "./route";

const BASE = "https://app.example";
const MEMBER_ID = "44444444-4444-4444-8444-444444444444";
const ACTOR_MEMBER_ID = "55555555-5555-4555-8555-555555555555";
const member = { memberId: MEMBER_ID };
const admin = { profile: { active: true, memberId: ACTOR_MEMBER_ID }, capabilities: { canAdminister: true } };
function request(fields: Record<string, string>, origin: string | null = BASE) {
  const form = new FormData(); for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest(`${BASE}/api/beheer/leden/delete`, { method: "POST", headers: origin ? { origin } : undefined, body: form });
}

describe("admin member delete POST boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks(); readAppBaseUrl.mockReturnValue(BASE); createServerSupabaseClient.mockResolvedValue({});
    loadAccountContextWithClient.mockResolvedValue(admin); list.mockResolvedValueOnce([member]).mockResolvedValueOnce([]);
  });
  it("server-reads, deletes by member ID and confirms absence", async () => {
    const response = await POST(request({ member_id: MEMBER_ID }));
    expect(deleteMember).toHaveBeenCalledWith(MEMBER_ID);
    expect(list).toHaveBeenCalledTimes(2);
    expect(response.headers.get("location")).toBe(`${BASE}/beheer/leden?notice=member-deleted`);
  });
  it("blocks self-delete before repository access", async () => {
    loadAccountContextWithClient.mockResolvedValueOnce({ ...admin, profile: { active: true, memberId: MEMBER_ID } });
    expect((await POST(request({ member_id: MEMBER_ID }))).headers.get("location")).toContain("not-authorized");
    expect(list).not.toHaveBeenCalled();
  });
  it.each([null, "https://evil.example"])('rejects Origin %s before Auth', async (origin) => {
    expect((await POST(request({ member_id: MEMBER_ID }, origin))).status).toBe(403);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
  it.each(["profile_id", "user_id", "email", "role"])('rejects forged field %s before Auth', async (field) => {
    await POST(request({ member_id: MEMBER_ID, [field]: "attacker" }));
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
  it("denies non-admin and inactive admin sessions", async () => {
    loadAccountContextWithClient.mockResolvedValueOnce({ profile: { active: true }, capabilities: { canAdminister: false } });
    expect((await POST(request({ member_id: MEMBER_ID }))).headers.get("location")).toContain("not-authorized");
    expect(deleteMember).not.toHaveBeenCalled();
  });
  it("maps the database active-participation guard to a finite safe code", async () => {
    const { StaffMemberActiveParticipationError } = await import("../../../../../lib/tos/staff-member-repository");
    deleteMember.mockRejectedValueOnce(new StaffMemberActiveParticipationError());
    const response = await POST(request({ member_id: MEMBER_ID }));
    expect(response.headers.get("location")).toBe(`${BASE}/beheer/leden?error=active-participation`);
  });
});
