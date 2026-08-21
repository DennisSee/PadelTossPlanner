import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const eventBySlug = vi.hoisted(() => vi.fn());
const load = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());

vi.mock("../../../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../../../lib/tos/staff-repository", () => ({ StaffTosEventRepository: class { eventBySlug = eventBySlug; } }));
vi.mock("../../../../../../lib/tos/planner-draft-repository", async (original) => {
  const actual = await original<typeof import("../../../../../../lib/tos/planner-draft-repository")>();
  return { ...actual, PlannerDraftRepository: class { load = load; save = save; } };
});

import { POST } from "./route";

const BASE = "https://app.example";
const event = { id: "11111111-1111-4111-8111-111111111111", slug: "vrijdag-padel", sport: "padel", startsAt: "2026-08-21T18:00:00Z", endsAt: "2026-08-21T20:00:00Z", status: "closed" };
const current = { eventId: event.id, players: [{ rowId: "22222222-2222-4222-8222-222222222222", name: "Ada", ranking: 3, included: true, availableFrom: "20:00", availableUntil: "22:00", memberId: "33333333-3333-4333-8333-333333333333", userId: "44444444-4444-4444-8444-444444444444" }], selectedCourts: ["Kremer Baan"], matchMinutes: 20, restMinutes: 0, searchProfile: "Normaal", allowRepeatPartners: false, levelMix: 50, teamDifferenceTolerance: 0.5, revision: 1, updatedBy: null, updatedByName: null, updatedAt: null, createdAt: null };

function request(extra: Record<string, string> = {}, origin: string | null = BASE) {
  const form = new FormData();
  const fields = {
    slug: event.slug, expected_revision: "1",
    players: JSON.stringify([{ rowId: current.players[0].rowId, name: "Ada A.", ranking: 4, included: true, availableFrom: "20:07", availableUntil: "22:00" }]),
    selected_courts: JSON.stringify(["Kremer Baan"]), match_minutes: "20", rest_minutes: "0",
    search_profile: "Normaal", allow_repeat_partners: "false", level_mix: "50",
    team_difference_tolerance: "0.5", ...extra,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest(`${BASE}/api/beheer/tos/planner/save`, { method: "POST", headers: origin ? { origin } : undefined, body: form });
}

describe("planner draft save route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAppBaseUrl.mockReturnValue(BASE);
    createServerSupabaseClient.mockResolvedValue({ requestScoped: true });
    loadAccountContextWithClient.mockResolvedValue({ capabilities: { canPlan: true } });
    eventBySlug.mockResolvedValue(event);
    load.mockResolvedValueOnce(current).mockImplementation(async () => ({ ...current, ...save.mock.calls[0][2], revision: 2 }));
    save.mockResolvedValue(2);
  });

  it("preserves server-held identity metadata while saving only editor fields", async () => {
    const response = await POST(request());
    expect(response.headers.get("location")).toContain("notice=draft-saved");
    const write = save.mock.calls[0][2];
    expect(write.players[0]).toMatchObject({ memberId: current.players[0].memberId, userId: current.players[0].userId, name: "Ada A." });
  });

  it.each(["member_id", "user_id", "registration_id", "updated_by", "event_id"])("rejects forged %s before Auth", async (field) => {
    const response = await POST(request({ [field]: "attacker" }));
    expect(response.status).toBe(400);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("rejects stale revisions without a save", async () => {
    load.mockReset();
    load.mockResolvedValue({ ...current, revision: 2 });
    const response = await POST(request());
    expect(response.headers.get("location")).toContain("error=conflict");
    expect(save).not.toHaveBeenCalled();
  });
});
