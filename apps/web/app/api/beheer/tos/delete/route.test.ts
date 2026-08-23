import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const eventById = vi.hoisted(() => vi.fn());
const deleteEvent = vi.hoisted(() => vi.fn());
vi.mock("../../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../../lib/tos/staff-repository", () => ({ StaffTosEventRepository: class { eventById = eventById; deleteEvent = deleteEvent; } }));
import { POST } from "./route";

const BASE = "https://app.example";
const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const event = { id: EVENT_ID, slug: "padel-tos-20260828-a1b2c3d4" };
const admin = { profile: { active: true }, capabilities: { canAdminister: true } };
function request(fields: Record<string, string>, origin: string | null = BASE) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest(`${BASE}/api/beheer/tos/delete`, { method: "POST", headers: origin ? { origin } : undefined, body: form });
}

describe("admin TOS delete POST boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks(); readAppBaseUrl.mockReturnValue(BASE); createServerSupabaseClient.mockResolvedValue({});
    loadAccountContextWithClient.mockResolvedValue(admin); eventById.mockResolvedValueOnce(event).mockResolvedValueOnce(null);
  });
  it("server-reads, deletes by ID and confirms absence before success", async () => {
    const response = await POST(request({ event_id: EVENT_ID }));
    expect(eventById).toHaveBeenNthCalledWith(1, EVENT_ID);
    expect(deleteEvent).toHaveBeenCalledWith(EVENT_ID);
    expect(eventById).toHaveBeenNthCalledWith(2, EVENT_ID);
    expect(response.headers.get("location")).toBe(`${BASE}/beheer?notice=event-deleted`);
  });
  it.each([null, "https://evil.example"])('rejects Origin %s before Auth', async (origin) => {
    expect((await POST(request({ event_id: EVENT_ID }, origin))).status).toBe(403);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
  it.each(["slug", "created_by", "member_id", "role"])('rejects forged field %s before Auth', async (field) => {
    await POST(request({ event_id: EVENT_ID, [field]: "attacker" }));
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
  it("denies planners, participants and inactive admins", async () => {
    for (const denied of [
      { profile: { active: true }, capabilities: { canAdminister: false } },
      { profile: { active: false }, capabilities: { canAdminister: true } },
    ]) {
      loadAccountContextWithClient.mockResolvedValueOnce(denied);
      expect((await POST(request({ event_id: EVENT_ID }))).headers.get("location")).toBe(`${BASE}/account`);
    }
    expect(deleteEvent).not.toHaveBeenCalled();
  });
});
