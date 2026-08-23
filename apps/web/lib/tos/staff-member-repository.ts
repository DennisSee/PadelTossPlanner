import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "./parser";
import {
  parseStaffMemberDirectoryRows,
  parseStaffSportProfileWriteResult,
  parseStaffRoleWriteResult,
} from "./staff-data-parser";
import type {
  StaffMemberDirectoryItem,
  StaffSportProfileWrite,
  StaffRoleWrite,
} from "./types";

export class StaffMemberDataError extends Error {
  constructor() {
    super("Leden zijn tijdelijk niet beschikbaar.");
    this.name = "StaffMemberDataError";
  }
}

export class StaffMemberActiveParticipationError extends StaffMemberDataError {
  constructor() {
    super();
    this.name = "StaffMemberActiveParticipationError";
  }
}

export class StaffMemberDeleteError extends StaffMemberDataError {
  constructor() {
    super();
    this.name = "StaffMemberDeleteError";
  }
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? String((error as { code: string }).code)
    : "";
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

  async updateRole(write: StaffRoleWrite) {
    if (!isUuid(write.profileId)) throw new StaffMemberDataError();
    const result = await this.client.rpc("admin_set_profile_role", {
      p_target_profile_id: write.profileId,
      p_role: write.role,
    });
    if (result.error) throw new StaffMemberDataError();
    try {
      return parseStaffRoleWriteResult(result.data);
    } catch {
      throw new StaffMemberDataError();
    }
  }

  async deleteMember(memberId: string): Promise<void> {
    if (!isUuid(memberId)) throw new StaffMemberDeleteError();
    const result = await this.client.rpc("admin_delete_member_account", { p_member_id: memberId });
    if (errorCode(result.error) === "55000") throw new StaffMemberActiveParticipationError();
    if (result.error || result.data !== true) throw new StaffMemberDeleteError();
  }
}
