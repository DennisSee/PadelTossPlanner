import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  ACCOUNT_MEMBER_SELECT,
  ACCOUNT_PROFILE_SELECT,
  AccountContextRepository,
  AccountContextUnavailableError,
} from "./account-repository";

function query(result: { data: unknown; error: unknown }) {
  const value = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
  };
  value.select.mockReturnValue(value);
  value.eq.mockReturnValue(value);
  value.limit.mockResolvedValue(result);
  return value;
}

function repository(profileData: unknown, memberData: unknown = []) {
  const profileQuery = query({ data: profileData, error: null });
  const memberQuery = query({ data: memberData, error: null });
  const from = vi.fn((table: string) => table === "profiles" ? profileQuery : memberQuery);
  return {
    repository: new AccountContextRepository({ from } as unknown as SupabaseClient),
    from,
    profileQuery,
    memberQuery,
  };
}

const identity = { userId: "user-1", email: "member@example.test" };
const profile = {
  id: "user-1",
  display_name: "Member",
  role: "admin",
  active: true,
  member_id: "member-1",
};
const member = {
  id: "member-1",
  display_name: "Member",
  approval_status: "approved",
  active: true,
};

describe("user-scoped account repository", () => {
  it("selects exact own profile/member columns under the verified identity", async () => {
    const fake = repository([profile], [member]);
    const context = await fake.repository.loadOwn(identity);
    expect(context.capabilities).toEqual({
      canParticipate: true,
      canPlan: true,
      canAdminister: true,
    });
    expect(ACCOUNT_PROFILE_SELECT).toBe("id,display_name,role,active,member_id");
    expect(ACCOUNT_MEMBER_SELECT).toBe("id,display_name,approval_status,active");
    expect(ACCOUNT_PROFILE_SELECT).not.toContain("*");
    expect(ACCOUNT_MEMBER_SELECT).not.toContain("*");
    expect(fake.profileQuery.select).toHaveBeenCalledWith(ACCOUNT_PROFILE_SELECT);
    expect(fake.profileQuery.eq).toHaveBeenCalledWith("id", identity.userId);
    expect(fake.memberQuery.select).toHaveBeenCalledWith(ACCOUNT_MEMBER_SELECT);
    expect(fake.memberQuery.eq).toHaveBeenCalledWith("id", "member-1");
  });

  it("does not accept a browser-provided cross-user id", () => {
    expect(AccountContextRepository.prototype.loadOwn).toHaveLength(1);
    expect(AccountContextRepository.toString()).not.toMatch(/service.?role|secret.?key/i);
  });

  it("updates the display name only through the existing self-service RPC", async () => {
    const rpc = vi.fn(async () => ({ data: [{ display_name: "Dennis Seesing" }], error: null }));
    const repository = new AccountContextRepository({ rpc } as unknown as SupabaseClient);
    await expect(repository.updateOwnDisplayName("Dennis Seesing")).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("update_my_display_name", {
      new_display_name: "Dennis Seesing",
    });
    expect(AccountContextRepository.prototype.updateOwnDisplayName).toHaveLength(1);
  });

  it("handles zero rows as a closed missing profile", async () => {
    const fake = repository([]);
    const context = await fake.repository.loadOwn(identity);
    expect(context.profile).toBeNull();
    expect(context.membership.state).toBe("inconsistent");
    expect(context.capabilities.canPlan).toBe(false);
  });

  it("fails safely for multiple or mismatched profile rows", async () => {
    await expect(repository([profile, profile]).repository.loadOwn(identity))
      .rejects.toBeInstanceOf(AccountContextUnavailableError);
    await expect(repository([{ ...profile, id: "other-user" }]).repository.loadOwn(identity))
      .rejects.toBeInstanceOf(AccountContextUnavailableError);
  });

  it("fails safely for multiple linked member rows", async () => {
    await expect(repository([profile], [member, member]).repository.loadOwn(identity))
      .rejects.toBeInstanceOf(AccountContextUnavailableError);
  });
});
