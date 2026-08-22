import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { StaffMemberDataError, StaffMemberRepository } from "./staff-member-repository";

const MEMBER_ID = "44444444-4444-4444-8444-444444444444";

function client(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  return { rpc, value: { rpc } as unknown as SupabaseClient };
}

describe("staff member repository", () => {
  it("uses only the narrow directory RPC", async () => {
    const fake = client({ data: [{
      member_id: MEMBER_ID,
      profile_id: "33333333-3333-4333-8333-333333333333",
      account_role: "participant",
      display_name: "Dennis",
      login_email: "dennis@example.test",
      approval_status: "approved",
      member_active: true,
      account_linked: true,
      padel_profile_active: true,
      padel_ranking: 4,
      tennis_profile_active: false,
      tennis_ranking: null,
    }], error: null });
    await expect(new StaffMemberRepository(fake.value).list()).resolves.toHaveLength(1);
    expect(fake.rpc).toHaveBeenCalledWith("staff_member_directory");
  });

  it("changes only a linked profile role through the admin RPC", async () => {
    const profileId = "33333333-3333-4333-8333-333333333333";
    const fake = client({ data: [{ profile_id: profileId, role: "planner" }], error: null });
    await expect(new StaffMemberRepository(fake.value).updateRole({ profileId, role: "planner" }))
      .resolves.toEqual({ profileId, role: "planner" });
    expect(fake.rpc).toHaveBeenCalledWith("admin_set_profile_role", { p_target_profile_id: profileId, p_role: "planner" });
  });

  it("writes exactly one member/sport profile through the JWT-scoped RPC", async () => {
    const fake = client({ data: [{ member_id: MEMBER_ID, sport: "tennis", active: true, ranking: 3 }], error: null });
    await expect(new StaffMemberRepository(fake.value).updateSportProfile({
      memberId: MEMBER_ID,
      sport: "tennis",
      active: true,
      ranking: 3,
    })).resolves.toMatchObject({ sport: "tennis", ranking: 3 });
    expect(fake.rpc).toHaveBeenCalledWith("staff_update_member_sport_profile", {
      p_member_id: MEMBER_ID,
      p_sport: "tennis",
      p_active: true,
      p_ranking: 3,
    });
  });

  it("fails closed for invalid IDs, RPC errors and leaked fields", async () => {
    const invalid = client({ data: [], error: null });
    await expect(new StaffMemberRepository(invalid.value).updateSportProfile({
      memberId: "attacker",
      sport: "padel",
      active: true,
      ranking: 4,
    })).rejects.toBeInstanceOf(StaffMemberDataError);
    expect(invalid.rpc).not.toHaveBeenCalled();

    const leaked = client({ data: [{
      member_id: MEMBER_ID,
      profile_id: "33333333-3333-4333-8333-333333333333",
      account_role: "participant",
      display_name: "Dennis",
      login_email: "dennis@example.test",
      approval_status: "approved",
      member_active: true,
      account_linked: true,
      padel_profile_active: true,
      padel_ranking: 4,
      tennis_profile_active: false,
      tennis_ranking: null,
      user_id: "private",
    }], error: null });
    await expect(new StaffMemberRepository(leaked.value).list())
      .rejects.toBeInstanceOf(StaffMemberDataError);
  });
});
