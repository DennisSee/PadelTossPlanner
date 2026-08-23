import { expect, it } from "vitest";
import { emptyPlannerDraft } from "./planner-draft";
import { InvalidPlannerGenerationError, plannerGenerateRequest } from "./planner-generation";
import type { TosEvent } from "./types";

const event: TosEvent = { id: "11111111-1111-4111-8111-111111111111", slug: "generate-padel", title: "Generate", sport: "padel", startsAt: "2026-08-21T18:07:00Z", endsAt: "2026-08-21T20:07:00Z", signupDeadline: null, status: "closed", maxParticipants: 24 };

it("builds the exact identity-free engine payload from included server draft rows", () => {
  const players = Array.from({ length: 4 }, (_, index) => ({ rowId: `${index + 1}1111111-1111-4111-8111-111111111111`, name: `Speler ${index}`, ranking: 3, included: true, availableFrom: "20:07", availableUntil: "22:07", memberId: "99999999-9999-4999-8999-999999999999" }));
  const court = { id: "c9000000-0000-4000-8000-000000000001", sport: "padel" as const, name: "Kremer Baan", active: true, sortOrder: 10 };
  const request = plannerGenerateRequest(event, { ...emptyPlannerDraft(event), revision: 1, selectedCourts: [court.id], players }, 42, [court]);
  expect(Object.keys(request).sort()).toEqual(["allow_repeat_partners","courts","end_time","generation_seed","level_mix","match_minutes","players","rest_minutes","search_profile","start_time","tolerance"].sort());
  expect(request.players[0]).toEqual({ name: "Speler 0", ranking: 3, available_from: "20:07", available_until: "22:07" });
  expect(JSON.stringify(request)).not.toMatch(/member|user|registration|event_id/iu);
});

it("rejects empty, inactive and cross-sport court selections", () => {
  expect(() => plannerGenerateRequest(event, emptyPlannerDraft(event), 1, [])).toThrow(InvalidPlannerGenerationError);

  const players = Array.from({ length: 4 }, (_, index) => ({
    rowId: `${index + 1}1111111-1111-4111-8111-111111111111`, name: `Speler ${index}`,
    ranking: 3, included: true, availableFrom: "20:07", availableUntil: "22:07",
  }));
  const selectedCourts = ["c9000000-0000-4000-8000-000000000001"];
  const draft = { ...emptyPlannerDraft(event), selectedCourts, players };
  expect(() => plannerGenerateRequest(event, draft, 1, [{ id: selectedCourts[0], sport: "padel", name: "Kremer Baan", active: false, sortOrder: 10 }])).toThrow(InvalidPlannerGenerationError);
  expect(() => plannerGenerateRequest(event, draft, 1, [{ id: selectedCourts[0], sport: "tennis", name: "Tennisbaan Noord", active: true, sortOrder: 10 }])).toThrow(InvalidPlannerGenerationError);
});

it("builds Tennis requests exclusively from trusted active Tennis courts", () => {
  const tennisEvent = { ...event, slug: "generate-tennis", sport: "tennis" as const };
  const players = Array.from({ length: 4 }, (_, index) => ({
    rowId: `${index + 1}1111111-1111-4111-8111-111111111111`, name: `Tennisser ${index}`,
    ranking: index + 1, included: true, availableFrom: "20:07", availableUntil: "22:07",
  }));
  const court = { id: "d9000000-0000-4000-8000-000000000001", sport: "tennis" as const, name: "Tennisbaan Noord", active: true, sortOrder: 10 };
  const request = plannerGenerateRequest(tennisEvent, { ...emptyPlannerDraft(tennisEvent), selectedCourts: [court.id], players }, 7, [court]);
  expect(request.courts).toEqual(["Tennisbaan Noord"]);
  expect(request.players.map((player) => player.ranking)).toEqual([1, 2, 3, 4]);
});
