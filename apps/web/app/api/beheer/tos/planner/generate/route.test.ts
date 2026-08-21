import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const eventBySlug = vi.hoisted(() => vi.fn());
const loadDraft = vi.hoisted(() => vi.fn());
const generatePlannerSchedule = vi.hoisted(() => vi.fn());

vi.mock("../../../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../../../lib/tos/staff-repository", () => ({ StaffTosEventRepository: class { eventBySlug = eventBySlug; } }));
vi.mock("../../../../../../lib/tos/planner-draft-repository", async (original) => {
  const actual = await original<typeof import("../../../../../../lib/tos/planner-draft-repository")>();
  return { ...actual, PlannerDraftRepository: class { load = loadDraft; } };
});
vi.mock("../../../../../../lib/planner-api/client", async (original) => {
  const actual = await original<typeof import("../../../../../../lib/planner-api/client")>();
  return { ...actual, generatePlannerSchedule };
});

import { POST } from "./route";

const BASE = "https://app.example";
const client = Object.freeze({ requestScoped: true });
const event = Object.freeze({ id: "11111111-1111-4111-8111-111111111111", slug: "vrijdag-padel", title: "Vrijdag", sport: "padel", startsAt: "2026-08-21T18:00:00Z", endsAt: "2026-08-21T20:00:00Z", signupDeadline: null, status: "closed" });
const draft = Object.freeze({
  eventId: event.id, revision: 2, selectedCourts: ["Kremer Baan"], matchMinutes: 20,
  restMinutes: 0, searchProfile: "Snel", allowRepeatPartners: false, levelMix: 50,
  teamDifferenceTolerance: 0.5, updatedBy: null, updatedByName: null, updatedAt: null, createdAt: null,
  players: ["Ada", "Bea", "Cleo", "Dora"].map((name, index) => ({ rowId: `${index + 1}1111111-1111-4111-8111-111111111111`, name, ranking: index + 1, included: true, availableFrom: null, availableUntil: null })),
});
const staff = { identity: { userId: "staff" }, capabilities: { canPlan: true } };

function request(body: unknown, origin: string | null = BASE) {
  return new NextRequest(`${BASE}/api/beheer/tos/planner/generate`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body),
  });
}

describe("planner generation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAppBaseUrl.mockReturnValue(BASE);
    createServerSupabaseClient.mockResolvedValue(client);
    loadAccountContextWithClient.mockResolvedValue(staff);
    eventBySlug.mockResolvedValue(event);
    loadDraft.mockResolvedValue(draft);
    generatePlannerSchedule.mockImplementation(async (payload) => ({ seed: payload.generation_seed, schedule: [], statistics: [], diagnostics: {} }));
  });

  it("derives all planner input server-side and returns a private no-store result", async () => {
    const response = await POST(request({ slug: event.slug, expected_revision: 2 }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(loadAccountContextWithClient).toHaveBeenCalledWith(client);
    const payload = generatePlannerSchedule.mock.calls[0][0];
    expect(payload.players.map((player: { name: string }) => player.name)).toEqual(["Ada", "Bea", "Cleo", "Dora"]);
    expect(payload.start_time).toBe("20:00");
    expect(payload.end_time).toBe("22:00");
    expect(payload).not.toHaveProperty("event_id");
    expect(payload).not.toHaveProperty("member_id");
  });

  it.each([null, "https://evil.example"])("rejects origin %s before Auth", async (origin) => {
    const response = await POST(request({ slug: event.slug, expected_revision: 2 }, origin));
    expect(response.status).toBe(403);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("rejects browser-supplied planner data and stale revisions", async () => {
    const forged = await POST(request({ slug: event.slug, expected_revision: 2, players: [] }));
    expect(forged.status).toBe(400);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    const stale = await POST(request({ slug: event.slug, expected_revision: 1 }));
    expect(stale.status).toBe(409);
    expect(generatePlannerSchedule).not.toHaveBeenCalled();
  });

  it("does not grant planner generation to participant capability", async () => {
    loadAccountContextWithClient.mockResolvedValueOnce({ identity: { userId: "participant" }, capabilities: { canPlan: false } });
    const response = await POST(request({ slug: event.slug, expected_revision: 2 }));
    expect(response.headers.get("location")).toBe(`${BASE}/account`);
    expect(loadDraft).not.toHaveBeenCalled();
  });

  it("returns only a finite error when the internal planner is unavailable", async () => {
    generatePlannerSchedule.mockRejectedValueOnce(new Error("internal upstream detail"));
    const response = await POST(request({ slug: event.slug, expected_revision: 2 }));
    expect(response.status).toBe(422);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: "generation-failed" });
    expect(body).not.toContain("internal upstream detail");
  });
});
