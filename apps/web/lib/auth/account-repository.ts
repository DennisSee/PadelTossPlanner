import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deriveAccountContext,
  type AccountContext,
  type AccountIdentity,
  type MemberRecord,
  type ProfileRecord,
} from "./account-context";

export const ACCOUNT_PROFILE_SELECT = "id,display_name,role,active,member_id";
export const ACCOUNT_MEMBER_SELECT = "id,display_name,approval_status,active";

export class AccountContextUnavailableError extends Error {
  constructor() {
    super("De accountstatus kon niet veilig worden geladen.");
    this.name = "AccountContextUnavailableError";
  }
}

type QueryResponse = Readonly<{ data: unknown; error: unknown }>;

function rowsFrom(response: QueryResponse): Record<string, unknown>[] {
  if (response.error || !Array.isArray(response.data)) {
    throw new AccountContextUnavailableError();
  }
  return response.data.filter(
    (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object",
  );
}

function profileRecord(row: Record<string, unknown>): ProfileRecord {
  return {
    id: String(row.id ?? ""),
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    role: typeof row.role === "string" ? row.role : null,
    active: row.active === true,
    member_id: typeof row.member_id === "string" ? row.member_id : null,
  };
}

function memberRecord(row: Record<string, unknown>): MemberRecord {
  return {
    id: String(row.id ?? ""),
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    approval_status:
      typeof row.approval_status === "string" ? row.approval_status : null,
    active: row.active === true,
  };
}

export class AccountContextRepository {
  constructor(private readonly client: SupabaseClient) {}

  async loadOwn(identity: AccountIdentity): Promise<AccountContext> {
    const profileResponse = await this.client
      .from("profiles")
      .select(ACCOUNT_PROFILE_SELECT)
      .eq("id", identity.userId)
      .limit(2);
    const profileRows = rowsFrom(profileResponse);
    if (profileRows.length > 1) throw new AccountContextUnavailableError();
    const profile = profileRows[0] ? profileRecord(profileRows[0]) : null;
    if (profile && profile.id !== identity.userId) {
      throw new AccountContextUnavailableError();
    }

    let member: MemberRecord | null = null;
    if (profile?.member_id) {
      const memberResponse = await this.client
        .from("club_members")
        .select(ACCOUNT_MEMBER_SELECT)
        .eq("id", profile.member_id)
        .limit(2);
      const memberRows = rowsFrom(memberResponse);
      if (memberRows.length > 1) throw new AccountContextUnavailableError();
      member = memberRows[0] ? memberRecord(memberRows[0]) : null;
    }
    return deriveAccountContext(identity, profile, member);
  }

  async updateOwnDisplayName(displayName: string): Promise<void> {
    const result = await this.client.rpc("update_my_display_name", {
      new_display_name: displayName,
    });
    if (result.error || !Array.isArray(result.data) || result.data.length !== 1) {
      throw new AccountContextUnavailableError();
    }
  }
}
