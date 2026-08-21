import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const eventBySlug = vi.hoisted(() => vi.fn());
const detail = vi.hoisted(() => vi.fn());
const setPublished = vi.hoisted(() => vi.fn());

vi.mock("../../../../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../../../../lib/tos/staff-repository", () => ({ StaffTosEventRepository: class { eventBySlug = eventBySlug; } }));
vi.mock("../../../../../../../lib/tos/schedule-repository", async (original) => {
  const actual = await original<typeof import("../../../../../../../lib/tos/schedule-repository")>();
  return { ...actual, StaffScheduleRepository: class { detail = detail; setPublished = setPublished; } };
});

import { POST } from "./route";

const BASE = "https://app.example";
const event = { id: "11111111-1111-4111-8111-111111111111", slug: "vrijdag-padel" };
const scheduleId = "22222222-2222-4222-8222-222222222222";

function request(extra: Record<string, string> = {}, origin: string | null = BASE) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ slug: event.slug, schedule_id: scheduleId, published: "true", ...extra })) form.set(key, value);
  return new NextRequest(`${BASE}/api/beheer/tos/planner/schedule/publish`, { method: "POST", headers: origin ? { origin } : undefined, body: form });
}

describe("schedule publication route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAppBaseUrl.mockReturnValue(BASE);
    createServerSupabaseClient.mockResolvedValue({ requestScoped: true });
    loadAccountContextWithClient.mockResolvedValue({ capabilities: { canPlan: true } });
    eventBySlug.mockResolvedValue(event);
    detail.mockResolvedValueOnce({ id: scheduleId, eventId: event.id, isPublished: false }).mockResolvedValueOnce({ id: scheduleId, eventId: event.id, isPublished: true });
  });

  it("uses slug and schedule id only as server-checked locators and rereads publication", async () => {
    const response = await POST(request());
    expect(detail).toHaveBeenNthCalledWith(1, event.id, scheduleId);
    expect(setPublished).toHaveBeenCalledWith(scheduleId, true);
    expect(detail).toHaveBeenNthCalledWith(2, event.id, scheduleId);
    expect(response.headers.get("location")).toBe(`${BASE}/beheer/tos/${event.slug}?notice=schedule-published`);
  });

  it.each([null, "https://evil.example"])("rejects origin %s before Auth", async (origin) => {
    const response = await POST(request({}, origin));
    expect(response.status).toBe(403);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it.each(["event_id", "created_by", "role", "schedule_public"])("rejects forged %s", async (field) => {
    const response = await POST(request({ [field]: "attacker" }));
    expect(response.status).toBe(400);
    expect(setPublished).not.toHaveBeenCalled();
  });
});
