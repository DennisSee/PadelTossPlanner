import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const eventBySlug = vi.hoisted(() => vi.fn());
const load = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());
const plannerInputForEvent = vi.hoisted(() => vi.fn());
const registrationOverviewForEvent = vi.hoisted(() => vi.fn());
const listSchedules = vi.hoisted(() => vi.fn());

vi.mock("../../../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../../../lib/tos/staff-repository", () => ({ StaffTosEventRepository: class { eventBySlug = eventBySlug; } }));
vi.mock("../../../../../../lib/tos/planner-draft-repository", async (original) => {
  const actual = await original<typeof import("../../../../../../lib/tos/planner-draft-repository")>();
  return { ...actual, PlannerDraftRepository: class { load = load; save = save; } };
});
vi.mock("../../../../../../lib/tos/staff-planner-input-repository", () => ({ StaffPlannerInputRepository: class { plannerInputForEvent = plannerInputForEvent; } }));
vi.mock("../../../../../../lib/tos/staff-registration-overview-repository", () => ({ StaffRegistrationOverviewRepository: class { forEvent = registrationOverviewForEvent; } }));
vi.mock("../../../../../../lib/tos/schedule-repository", () => ({ StaffScheduleRepository: class { list = listSchedules; } }));

import { POST } from "./route";

const BASE = "https://app.example";
const event = { id: "11111111-1111-4111-8111-111111111111", slug: "vrijdag-padel", sport: "padel", startsAt: "2026-08-21T18:00:00Z", endsAt: "2026-08-21T20:00:00Z", status: "closed" };
const draft = { eventId: event.id, players: [], selectedCourts: [], matchMinutes: 20, restMinutes: 0, searchProfile: "Normaal", allowRepeatPartners: false, levelMix: 50, teamDifferenceTolerance: 0.5, revision: 0, updatedBy: null, updatedByName: null, updatedAt: null, createdAt: null };

function request(extra: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ slug: event.slug, expected_revision: "0", ...extra })) form.set(key, value);
  return new NextRequest(`${BASE}/api/beheer/tos/planner/import`, { method: "POST", headers: { origin: BASE }, body: form });
}

describe("registration import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAppBaseUrl.mockReturnValue(BASE);
    createServerSupabaseClient.mockResolvedValue({ requestScoped: true });
    loadAccountContextWithClient.mockResolvedValue({ capabilities: { canPlan: true } });
    eventBySlug.mockResolvedValue(event);
    load.mockResolvedValueOnce(draft).mockImplementation(async () => ({ ...draft, ...save.mock.calls[0][2], revision: 1 }));
    const placed = { registrationId: "22222222-2222-4222-8222-222222222222", userId: "33333333-3333-4333-8333-333333333333", memberId: "44444444-4444-4444-8444-444444444444", response: "attending", availableFrom: event.startsAt, availableUntil: event.endsAt, registrationUpdatedAt: "2026-08-20T10:00:00Z", displayName: "Ada", approvalStatus: "approved", memberActive: true, sportProfileActive: true, ranking: 4 };
    plannerInputForEvent.mockResolvedValue([placed]);
    registrationOverviewForEvent.mockResolvedValue([{ ...placed, placementStatus: "placed", waitlistPosition: null }]);
    listSchedules.mockResolvedValue([]);
    save.mockResolvedValue(1);
  });

  it("reads registrations server-side and imports stable identity into the private draft", async () => {
    const response = await POST(request());
    expect(plannerInputForEvent).toHaveBeenCalledWith(event.id);
    expect(save.mock.calls[0][2].players[0]).toMatchObject({ name: "Ada", memberId: "44444444-4444-4444-8444-444444444444" });
    expect(response.headers.get("location")).toContain("notice=registrations-imported");
  });

  it("does not bump the draft revision when reconciliation is already current", async () => {
    const linked = { rowId: "55555555-5555-4555-8555-555555555555", name: "Ada", ranking: 4, included: true, availableFrom: "20:00", availableUntil: "22:00", memberId: "44444444-4444-4444-8444-444444444444", userId: "33333333-3333-4333-8333-333333333333", registrationId: "22222222-2222-4222-8222-222222222222", registrationUpdatedAt: "2026-08-20T10:00:00Z", sourceEventId: event.id };
    load.mockReset().mockResolvedValue({ ...draft, players: [linked] });
    const response = await POST(request());
    expect(save).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("notice=registrations-current");
  });

  it("warns that an existing published schedule must be regenerated", async () => {
    listSchedules.mockResolvedValue([{ isPublished: true }]);
    const response = await POST(request());
    expect(response.headers.get("location")).toContain("notice=registrations-imported-regenerate");
  });

  it("accepts no browser registration or identity authority", async () => {
    const response = await POST(request({ member_id: "attacker" }));
    expect(response.status).toBe(400);
    expect(plannerInputForEvent).not.toHaveBeenCalled();
  });
});
