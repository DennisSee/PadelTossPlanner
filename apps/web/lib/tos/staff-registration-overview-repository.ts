import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "./parser";
import { parseStaffRegistrationOverviewRows } from "./staff-data-parser";
import type { StaffRegistrationOverview } from "./types";

export class StaffRegistrationOverviewDataError extends Error {
  constructor() {
    super("Deelnemers zijn tijdelijk niet beschikbaar.");
    this.name = "StaffRegistrationOverviewDataError";
  }
}

export class StaffRegistrationOverviewRepository {
  constructor(private readonly client: SupabaseClient) {}

  async forEvent(eventId: string): Promise<StaffRegistrationOverview[]> {
    if (!isUuid(eventId)) throw new StaffRegistrationOverviewDataError();
    const result = await this.client.rpc("staff_event_registration_overview", {
      p_event_id: eventId,
    });
    if (result.error) throw new StaffRegistrationOverviewDataError();
    try {
      return parseStaffRegistrationOverviewRows(result.data);
    } catch {
      throw new StaffRegistrationOverviewDataError();
    }
  }
}
