import { expect, it } from "vitest";
import { emptyPlannerDraft } from "./planner-draft";
import { InvalidPlannerGenerationError, plannerGenerateRequest } from "./planner-generation";
import type { TosEvent } from "./types";

const event: TosEvent = { id: "11111111-1111-4111-8111-111111111111", slug: "generate-padel", title: "Generate", sport: "padel", startsAt: "2026-08-21T18:07:00Z", endsAt: "2026-08-21T20:07:00Z", signupDeadline: null, status: "closed", maxParticipants: 24 };

it("builds the exact identity-free engine payload from included server draft rows", () => {
  const players = Array.from({ length: 4 }, (_, index) => ({ rowId: `${index + 1}1111111-1111-4111-8111-111111111111`, name: `Speler ${index}`, ranking: 3, included: true, availableFrom: "20:07", availableUntil: "22:07", memberId: "99999999-9999-4999-8999-999999999999" }));
  const request = plannerGenerateRequest(event, { ...emptyPlannerDraft(event), revision: 1, selectedCourts: ["Kremer Baan"], players }, 42);
  expect(Object.keys(request).sort()).toEqual(["allow_repeat_partners","courts","end_time","generation_seed","level_mix","match_minutes","players","rest_minutes","search_profile","start_time","tolerance"].sort());
  expect(request.players[0]).toEqual({ name: "Speler 0", ranking: 3, available_from: "20:07", available_until: "22:07" });
  expect(JSON.stringify(request)).not.toMatch(/member|user|registration|event_id/iu);
});

it("rejects unsaved, insufficient and tennis inputs", () => {
  expect(() => plannerGenerateRequest(event, emptyPlannerDraft(event), 1)).toThrow(InvalidPlannerGenerationError);
  expect(() => plannerGenerateRequest({ ...event, sport: "tennis" }, { ...emptyPlannerDraft(event), players: [] }, 1)).toThrow(InvalidPlannerGenerationError);
});
