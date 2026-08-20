import { describe, expect, it } from "vitest";

import { deriveAccountContext, type MemberRecord, type ProfileRecord } from "./account-context";

const identity = { userId: "user-1", email: "member@example.test" };

function profile(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id: "user-1",
    display_name: "Lid",
    role: "participant",
    active: true,
    member_id: "member-1",
    ...overrides,
  };
}

function member(overrides: Partial<MemberRecord> = {}): MemberRecord {
  return {
    id: "member-1",
    display_name: "Lid",
    approval_status: "approved",
    active: true,
    ...overrides,
  };
}

describe("AUTH-2 account capability model", () => {
  it.each([
    ["participant", true, false, false],
    ["planner", true, true, false],
    ["admin", true, true, true],
  ] as const)("separates approved membership from %s staff rights", (role, participate, plan, admin) => {
    const context = deriveAccountContext(identity, profile({ role }), member());
    expect(context.capabilities).toEqual({
      canParticipate: participate,
      canPlan: plan,
      canAdminister: admin,
    });
  });

  it.each(["participant", "planner", "admin"] as const)(
    "does not infer membership from the %s role",
    (role) => {
      const context = deriveAccountContext(
        identity,
        profile({ role, member_id: null }),
        null,
      );
      expect(context.membership.state).toBe("missing");
      expect(context.capabilities.canParticipate).toBe(false);
      expect(context.capabilities.canPlan).toBe(role !== "participant");
      expect(context.capabilities.canAdminister).toBe(role === "admin");
    },
  );

  it.each([
    ["pending", member({ approval_status: "pending" })],
    ["rejected", member({ approval_status: "rejected" })],
    ["inactive", member({ active: false })],
    ["inconsistent", member({ id: "other-member" })],
    ["inconsistent", member({ approval_status: "unknown" })],
  ] as const)("fails participant capability closed for %s", (state, linkedMember) => {
    const context = deriveAccountContext(identity, profile(), linkedMember);
    expect(context.membership.state).toBe(state);
    expect(context.capabilities.canParticipate).toBe(false);
  });

  it("removes all capabilities for inactive, unknown or missing profiles", () => {
    expect(deriveAccountContext(identity, profile({ active: false, role: "admin" }), member()).capabilities)
      .toEqual({ canParticipate: false, canPlan: false, canAdminister: false });
    expect(deriveAccountContext(identity, profile({ role: "owner" }), member()).capabilities)
      .toEqual({ canParticipate: false, canPlan: false, canAdminister: false });
    expect(deriveAccountContext(identity, null, null).capabilities)
      .toEqual({ canParticipate: false, canPlan: false, canAdminister: false });
  });

  it("returns immutable context structures", () => {
    const context = deriveAccountContext(identity, profile(), member());
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.identity)).toBe(true);
    expect(Object.isFrozen(context.capabilities)).toBe(true);
  });
});
