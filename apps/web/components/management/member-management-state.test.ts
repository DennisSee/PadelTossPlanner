import { describe, expect, it } from "vitest";

import type { StaffMemberDirectoryItem } from "../../lib/tos/types";
import {
  activeFilterCount,
  EMPTY_MEMBER_FILTERS,
  filterMembers,
  memberDraft,
  pendingMemberChange,
  withPendingMember,
} from "./member-management-state";

const member: StaffMemberDirectoryItem = Object.freeze({
  memberId: "44444444-4444-4444-8444-444444444444",
  profileId: "33333333-3333-4333-8333-333333333333",
  accountRole: "participant",
  displayName: "Dennis Seesing",
  loginEmail: "dennis@example.test",
  approvalStatus: "approved",
  memberActive: true,
  accountLinked: true,
  padelProfileActive: true,
  padelRanking: 4,
  tennisProfileActive: false,
  tennisRanking: null,
});

describe("staged member edits", () => {
  it("keeps serverstate clean and counts a member once across multiple fields", () => {
    const original = memberDraft(member);
    expect(pendingMemberChange(member, original, true)).toBeNull();
    const changed = { ...original, padel: { active: true, ranking: 2 }, tennis: { active: true, ranking: 3 } };
    expect(pendingMemberChange(member, changed, true)).toEqual({
      padel: { active: true, ranking: 2 },
      tennis: { active: true, ranking: 3 },
    });
  });

  it("removes dirty state after reverting and never stages a forbidden role", () => {
    const original = memberDraft(member);
    expect(pendingMemberChange(member, { ...original, role: "admin" }, false)).toBeNull();
    expect(pendingMemberChange(member, { ...original, role: "admin" }, true)).toEqual({ role: "admin" });
    expect(pendingMemberChange(member, { ...original, padel: { active: true, ranking: 4 } }, true)).toBeNull();
  });

  it("projects staged values without replacing member identity or private context", () => {
    const projected = withPendingMember(member, { padel: { active: false, ranking: 2 }, role: "planner" });
    expect(projected).toMatchObject({
      memberId: member.memberId,
      profileId: member.profileId,
      loginEmail: member.loginEmail,
      padelProfileActive: false,
      padelRanking: 2,
      accountRole: "planner",
    });
  });
});

describe("member directory filters", () => {
  const looseMember = { ...member, memberId: "55555555-5555-4555-8555-555555555555", displayName: "Los Lid", loginEmail: null, profileId: null, accountRole: null, accountLinked: false, padelProfileActive: false } as const;

  it("filters existing name/email data and clears back to all members", () => {
    expect(filterMembers([member, looseMember], { ...EMPTY_MEMBER_FILTERS, query: "example.test" })).toEqual([member]);
    expect(filterMembers([member, looseMember], { ...EMPTY_MEMBER_FILTERS, query: "Los" })).toEqual([looseMember]);
    expect(filterMembers([member, looseMember], EMPTY_MEMBER_FILTERS)).toHaveLength(2);
  });

  it("filters linked accounts, sport profiles and missing active levels", () => {
    expect(filterMembers([member, looseMember], { ...EMPTY_MEMBER_FILTERS, account: "unlinked" })).toEqual([looseMember]);
    expect(filterMembers([member, looseMember], { ...EMPTY_MEMBER_FILTERS, sport: "padel" })).toEqual([member]);
    const missing = { ...member, padelRanking: null };
    expect(filterMembers([missing, looseMember], { ...EMPTY_MEMBER_FILTERS, level: "missing" })).toEqual([missing]);
    expect(activeFilterCount({ ...EMPTY_MEMBER_FILTERS, account: "linked", sport: "padel" })).toBe(2);
  });
});
