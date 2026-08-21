import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const loadOwn = vi.hoisted(() => vi.fn());
const updateOwnDisplayName = vi.hoisted(() => vi.fn());

vi.mock("../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../lib/auth/account-repository", () => ({
  AccountContextRepository: class {
    loadOwn = loadOwn;
    updateOwnDisplayName = updateOwnDisplayName;
  },
}));

import { POST } from "./route";

const APP_BASE_URL = "https://app.example";
const client = Object.freeze({ requestScoped: true });
const before = {
  identity: { userId: "11111111-1111-4111-8111-111111111111", email: "dennis@example.test" },
  profile: { displayName: "Dennis", role: "admin", active: true, memberId: "22222222-2222-4222-8222-222222222222" },
  membership: { state: "approved", memberId: "22222222-2222-4222-8222-222222222222", displayName: "Dennis" },
  capabilities: { canParticipate: true, canPlan: true, canAdminister: true },
};

function request(fields: [string, string][], origin: string | null = APP_BASE_URL) {
  const form = new FormData();
  for (const [key, value] of fields) form.append(key, value);
  return new NextRequest(`${APP_BASE_URL}/api/account/display-name`, {
    method: "POST",
    headers: origin ? { origin } : undefined,
    body: form,
  });
}

describe("own display-name POST boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAppBaseUrl.mockReturnValue(APP_BASE_URL);
    createServerSupabaseClient.mockResolvedValue(client);
    loadAccountContextWithClient.mockResolvedValue(before);
    loadOwn.mockResolvedValue({
      ...before,
      profile: { ...before.profile, displayName: "Dennis Seesing" },
      membership: { ...before.membership, displayName: "Dennis Seesing" },
    });
  });

  it("updates only the own name through the user-scoped RPC and rereads it", async () => {
    const response = await POST(request([["display_name", "  Dennis Seesing  "]]));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/account?notice=display-name-updated`);
    expect(loadAccountContextWithClient).toHaveBeenCalledWith(client);
    expect(updateOwnDisplayName).toHaveBeenCalledWith("Dennis Seesing");
    expect(loadOwn).toHaveBeenCalledWith(before.identity);
  });

  it.each([
    { fields: [["display_name", ""]] },
    { fields: [["display_name", "Dennis"], ["display_name", "Attacker"]] },
    { fields: [["display_name", "Dennis"], ["member_id", before.profile.memberId]] },
    { fields: [["display_name", "Bad\nName"]] },
  ] as { fields: [string, string][] }[])("rejects invalid or authority-bearing input before Auth %#", async ({ fields }) => {
    const response = await POST(request(fields));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/account?error=invalid-request`);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it.each([null, "https://evil.example"])('rejects Origin "%s" before parsing/Auth', async (origin) => {
    const response = await POST(request([["display_name", "Dennis"]], origin));
    expect(response.status).toBe(403);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("does not allow an inactive or unlinked account to mutate a name", async () => {
    loadAccountContextWithClient.mockResolvedValueOnce({
      ...before,
      profile: { ...before.profile, active: false, memberId: null },
    });
    const response = await POST(request([["display_name", "Dennis"]]));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/account?error=not-authorized`);
    expect(updateOwnDisplayName).not.toHaveBeenCalled();
  });

  it("fails closed when the atomic reread does not match", async () => {
    loadOwn.mockResolvedValueOnce(before);
    const response = await POST(request([["display_name", "Dennis Seesing"]]));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/account?error=temporarily-unavailable`);
  });
});
