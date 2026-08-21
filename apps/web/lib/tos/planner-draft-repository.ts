import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { emptyPlannerDraft, parsePlannerDraftRow, plannerPlayersJson } from "./planner-draft";
import { isUuid } from "./parser";
import type { PlannerDraft, PlannerDraftWrite, TosEvent } from "./types";

type RpcResult = Readonly<{ data?: unknown; error?: unknown }>;

export class PlannerDraftDataError extends Error {
  constructor() {
    super("De planneropzet is tijdelijk niet beschikbaar.");
    this.name = "PlannerDraftDataError";
  }
}

export class PlannerDraftConflictError extends PlannerDraftDataError {
  constructor() {
    super();
    this.name = "PlannerDraftConflictError";
  }
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? String((error as { code: string }).code)
    : "";
}

export class PlannerDraftRepository {
  constructor(private readonly client: SupabaseClient) {}

  async load(event: TosEvent): Promise<PlannerDraft> {
    if (!isUuid(event.id)) throw new PlannerDraftDataError();
    const result = await this.client.rpc("staff_event_planner_draft", { p_event_id: event.id }) as RpcResult;
    if (result.error) throw new PlannerDraftDataError();
    if (!Array.isArray(result.data)) throw new PlannerDraftDataError();
    if (result.data.length === 0) return emptyPlannerDraft(event);
    if (result.data.length !== 1) throw new PlannerDraftDataError();
    try {
      const parsed = parsePlannerDraftRow(result.data[0]);
      if (parsed.eventId !== event.id) throw new PlannerDraftDataError();
      return parsed;
    } catch {
      throw new PlannerDraftDataError();
    }
  }

  async save(event: TosEvent, expectedRevision: number, write: PlannerDraftWrite): Promise<number> {
    if (!isUuid(event.id) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new PlannerDraftDataError();
    }
    const result = await this.client.rpc("staff_save_event_planner_draft", {
      p_event_id: event.id,
      p_expected_revision: expectedRevision,
      p_players: plannerPlayersJson(write.players),
      p_selected_courts: write.selectedCourts,
      p_match_minutes: write.matchMinutes,
      p_rest_minutes: write.restMinutes,
      p_search_profile: write.searchProfile,
      p_allow_repeat_partners: write.allowRepeatPartners,
      p_level_mix: write.levelMix,
      p_team_difference_tolerance: write.teamDifferenceTolerance,
    }) as RpcResult;
    if (result.error) {
      if (errorCode(result.error) === "40001") throw new PlannerDraftConflictError();
      throw new PlannerDraftDataError();
    }
    if (!Number.isSafeInteger(result.data) || typeof result.data !== "number" || result.data < 1) {
      throw new PlannerDraftDataError();
    }
    return result.data;
  }
}
