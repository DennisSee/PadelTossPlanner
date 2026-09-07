import { expect, it } from "vitest";
import { plannerCheckpointContext } from "./checkpoint";
import type { ClubCourt, PlannerDraft, TosEvent } from "../tos/types";

const event = { id: "event-a", slug: "event-a", sport: "padel" } as TosEvent;
const draft = { revision: 1, selectedCourts: ["court-a"], searchProfile: "Normaal",
  players: [{ rowId: "player-a", ranking: 3, name: "Synthetic" }], matchMinutes: 20 } as unknown as PlannerDraft;
const courts = [{ id: "court-a", name: "Court A", active: true }] as ClubCourt[];

it("binds event/slug, revision, settings, selected courts and private player identity", () => {
  const original = plannerCheckpointContext(event, draft, courts);
  expect(original).toMatch(/^[0-9a-f]{64}$/u);
  expect(plannerCheckpointContext({ ...event }, { ...draft }, [...courts])).toBe(original);
  for (const changed of [{ ...event, id: "event-b" }, { ...event, slug: "event-b" }]) {
    expect(plannerCheckpointContext(changed, draft, courts)).not.toBe(original);
  }
  for (const changed of [
    { ...draft, revision: 2 }, { ...draft, matchMinutes: 30 as const }, { ...draft, searchProfile: "Uitgebreid" as const },
    { ...draft, selectedCourts: ["court-b"] }, { ...draft, players: [{ ...draft.players[0], ranking: 4 }] },
    { ...draft, players: [{ ...draft.players[0], rowId: "player-b" }] },
  ]) expect(plannerCheckpointContext(event, changed, courts)).not.toBe(original);
  expect(plannerCheckpointContext(event, draft, [{ ...courts[0], name: "Renamed" }])).not.toBe(original);
});
