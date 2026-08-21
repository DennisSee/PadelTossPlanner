import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "./parser";
import {
  parseStaffMemberDirectoryRows,
  parseStaffSportProfileWriteResult,
} from "./staff-data-parser";
import type {
  StaffMemberDirectoryItem,
  StaffSportProfileWrite,
} from "./types";

export class StaffMemberDataError extends Error {
  constructor() {
    super("Leden zijn tijdelijk niet beschikbaar.");
    this.name = "StaffMemberDataError";
  }
}

export class StaffMemberRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(): Promise<StaffMemberDirectoryItem[]> {
    const result = await this.client.rpc("staff_member_directory");
    if (result.error) throw new StaffMemberDataError();
    try {
      return parseStaffMemberDirectoryRows(result.data);
    } catch {
      throw new StaffMemberDataError();
    }
  }

  async updateSportProfile(write: StaffSportProfileWrite) {
    if (!isUuid(write.memberId)) throw new StaffMemberDataError();
    const result = await this.client.rpc("staff_update_member_sport_profile", {
      p_member_id: write.memberId,
      p_sport: write.sport,
      p_active: write.active,
      p_ranking: write.ranking,
    });
    if (result.error) throw new StaffMemberDataError();
    try {
      return parseStaffSportProfileWriteResult(result.data);
    } catch {
      throw new StaffMemberDataError();
    }
  }
}
