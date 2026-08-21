import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "./parser";
import { parseStaffPlannerInputRows } from "./staff-planner-input-parser";
import type { StaffPlannerInput } from "./types";

type QueryResult = Readonly<{ data?: unknown; error?: unknown }>;

export class StaffPlannerInputDataError extends Error {
  constructor() {
    super("Deelnemers zijn tijdelijk niet beschikbaar.");
    this.name = "StaffPlannerInputDataError";
  }
}

export class StaffPlannerInputRepository {
  constructor(private readonly client: SupabaseClient) {}

  async plannerInputForEvent(eventId: string): Promise<StaffPlannerInput[]> {
    if (!isUuid(eventId)) throw new StaffPlannerInputDataError();
    const result = await this.client.rpc("staff_event_planner_input", {
      p_event_id: eventId,
    }) as QueryResult;
    if (result.error) throw new StaffPlannerInputDataError();
    try {
      return parseStaffPlannerInputRows(result.data);
    } catch {
      throw new StaffPlannerInputDataError();
    }
  }
}
