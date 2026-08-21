import { formatEventClock } from "./time";
import type { PlannerDraft, TosEvent } from "./types";
import type { PlannerGenerateRequest } from "../planner-api/types";

export class InvalidPlannerGenerationError extends Error {
  constructor() {
    super("De planneropzet kan nog niet worden gegenereerd.");
    this.name = "InvalidPlannerGenerationError";
  }
}

export function plannerGenerateRequest(
  event: TosEvent,
  draft: PlannerDraft,
  generationSeed: number,
): PlannerGenerateRequest {
  const included = draft.players.filter((player) => player.included);
  if (event.sport !== "padel" || event.status === "cancelled" || included.length < 4 ||
      draft.selectedCourts.length < 1 || included.length < draft.selectedCourts.length * 4 ||
      !Number.isSafeInteger(generationSeed) || generationSeed < 0) throw new InvalidPlannerGenerationError();
  return Object.freeze({
    players: included.map((player) => Object.freeze({
      name: player.name,
      ranking: player.ranking,
      available_from: player.availableFrom ?? formatEventClock(event.startsAt),
      available_until: player.availableUntil ?? formatEventClock(event.endsAt),
    })),
    courts: draft.selectedCourts,
    start_time: formatEventClock(event.startsAt),
    end_time: formatEventClock(event.endsAt),
    match_minutes: draft.matchMinutes,
    rest_minutes: draft.restMinutes,
    search_profile: draft.searchProfile,
    allow_repeat_partners: draft.allowRepeatPartners,
    level_mix: draft.levelMix,
    tolerance: draft.teamDifferenceTolerance,
    generation_seed: generationSeed,
  });
}
