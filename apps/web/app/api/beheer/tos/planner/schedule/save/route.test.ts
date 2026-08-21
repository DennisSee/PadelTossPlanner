import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const eventBySlug = vi.hoisted(() => vi.fn());
const loadDraft = vi.hoisted(() => vi.fn());
const generatePlannerSchedule = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());
const detail = vi.hoisted(() => vi.fn());

vi.mock("../../../../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../../../../lib/tos/staff-repository", () => ({ StaffTosEventRepository: class { eventBySlug = eventBySlug; } }));
vi.mock("../../../../../../../lib/tos/planner-draft-repository", () => ({ PlannerDraftRepository: class { load = loadDraft; } }));
vi.mock("../../../../../../../lib/planner-api/client", async (original) => {
  const actual = await original<typeof import("../../../../../../../lib/planner-api/client")>();
  return { ...actual, generatePlannerSchedule };
});
vi.mock("../../../../../../../lib/tos/schedule-repository", async (original) => {
  const actual = await original<typeof import("../../../../../../../lib/tos/schedule-repository")>();
  return { ...actual, StaffScheduleRepository: class { save = save; detail = detail; } };
});

import { POST } from "./route";

const BASE = "https://app.example";
const scheduleId = "22222222-2222-4222-8222-222222222222";
const event = { id: "11111111-1111-4111-8111-111111111111", slug: "vrijdag-padel", title: "Vrijdag", sport: "padel", startsAt: "2026-08-21T18:00:00Z", endsAt: "2026-08-21T20:00:00Z", signupDeadline: null, status: "closed" };
const draft = { eventId: event.id, revision: 2, players: ["Ada", "Bea", "Cleo", "Dora"].map((name, index) => ({ rowId: `${index + 1}1111111-1111-4111-8111-111111111111`, name, ranking: index + 1, included: true, availableFrom: "20:00", availableUntil: "22:00" })), selectedCourts: ["Kremer Baan"], matchMinutes: 20, restMinutes: 0, searchProfile: "Snel", allowRepeatPartners: false, levelMix: 50, teamDifferenceTolerance: 0.5, updatedBy: null, updatedByName: null, updatedAt: null, createdAt: null };
const generation = { seed: 77, schedule: [{ Ronde: 1, Tijd: "20:00 - 20:20", Baan: "Kremer Baan", "Team 1": "Ada & Bea", "Niveau T1": 2, "Team 2": "Cleo & Dora", "Niveau T2": 4, Teamverschil: 2, Rust: "Niemand", "Nog niet aanwezig": "Niemand", "Niet meer beschikbaar": "Niemand" }], statistics: [], diagnostics: {} };

function request(extra: Record<string, string> = {}, origin: string | null = BASE) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ slug: event.slug, expected_revision: "2", generation_seed: "77", ...extra })) form.set(key, value);
  return new NextRequest(`${BASE}/api/beheer/tos/planner/schedule/save`, { method: "POST", headers: origin ? { origin } : undefined, body: form });
}

describe("private schedule save route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAppBaseUrl.mockReturnValue(BASE);
    createServerSupabaseClient.mockResolvedValue({ requestScoped: true });
    loadAccountContextWithClient.mockResolvedValue({ capabilities: { canPlan: true } });
    eventBySlug.mockResolvedValue(event);
    loadDraft.mockResolvedValue(draft);
    generatePlannerSchedule.mockResolvedValue(generation);
    save.mockResolvedValue(scheduleId);
    detail.mockResolvedValue({ ...generation, id: scheduleId, eventId: event.id, generationSeed: 77, plannerDraftRevision: 2, title: event.title, startTime: "20:00", endTime: "22:00", matchMinutes: 20, courts: ["Kremer Baan"] });
  });

  it("regenerates authoritatively with the same seed before private save and rereads", async () => {
    const response = await POST(request());
    expect(response.headers.get("location")).toBe(`${BASE}/beheer/tos/${event.slug}?notice=schedule-saved`);
    expect(generatePlannerSchedule).toHaveBeenCalledTimes(1);
    expect(generatePlannerSchedule.mock.calls[0][0].generation_seed).toBe(77);
    expect(save).toHaveBeenCalledWith(event, draft, generation);
    expect(detail).toHaveBeenCalledWith(event.id, scheduleId);
  });

  it.each(["schedule", "statistics", "diagnostics", "players_private", "event_id", "created_by"])("rejects forged %s", async (field) => {
    const response = await POST(request({ [field]: "attacker" }));
    expect(response.status).toBe(400);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("does not save a result for a stale draft or mismatching reread", async () => {
    const stale = await POST(request({ expected_revision: "1" }));
    expect(stale.headers.get("location")).toContain("error=conflict");
    expect(save).not.toHaveBeenCalled();
    detail.mockResolvedValueOnce({ ...generation, id: scheduleId, eventId: event.id, generationSeed: 78, plannerDraftRevision: 2, title: event.title, startTime: "20:00", endTime: "22:00", matchMinutes: 20, courts: ["Kremer Baan"] });
    const mismatch = await POST(request());
    expect(mismatch.headers.get("location")).toContain("error=temporarily-unavailable");
  });
});
