import type { AccountRole } from "../../lib/auth/account-context";
import type { StaffMemberDirectoryItem } from "../../lib/tos/types";

export type SportEdit = Readonly<{ active: boolean; ranking: number | null }>;

export type MemberEditDraft = Readonly<{
  padel: SportEdit;
  tennis: SportEdit;
  role: AccountRole | null;
}>;

export type PendingMemberChange = Readonly<{
  padel?: SportEdit;
  tennis?: SportEdit;
  role?: AccountRole;
}>;

export type MemberFilters = Readonly<{
  query: string;
  account: "all" | "linked" | "unlinked";
  sport: "all" | "padel" | "tennis" | "both";
  level: "all" | "missing";
}>;

export const EMPTY_MEMBER_FILTERS: MemberFilters = Object.freeze({
  query: "",
  account: "all",
  sport: "all",
  level: "all",
});

function sameSport(left: SportEdit, right: SportEdit): boolean {
  return left.active === right.active && left.ranking === right.ranking;
}

export function memberDraft(member: StaffMemberDirectoryItem, pending?: PendingMemberChange): MemberEditDraft {
  return Object.freeze({
    padel: pending?.padel ?? Object.freeze({ active: member.padelProfileActive, ranking: member.padelRanking }),
    tennis: pending?.tennis ?? Object.freeze({ active: member.tennisProfileActive, ranking: member.tennisRanking }),
    role: pending?.role ?? member.accountRole,
  });
}

export function pendingMemberChange(
  member: StaffMemberDirectoryItem,
  draft: MemberEditDraft,
  allowRole: boolean,
): PendingMemberChange | null {
  const original = memberDraft(member);
  const pending: { padel?: SportEdit; tennis?: SportEdit; role?: AccountRole } = {};
  if (!sameSport(original.padel, draft.padel)) pending.padel = Object.freeze({ ...draft.padel });
  if (!sameSport(original.tennis, draft.tennis)) pending.tennis = Object.freeze({ ...draft.tennis });
  if (allowRole && member.accountRole && draft.role && draft.role !== member.accountRole) pending.role = draft.role;
  return Object.keys(pending).length ? Object.freeze(pending) : null;
}

export function withPendingMember(
  member: StaffMemberDirectoryItem,
  pending?: PendingMemberChange,
): StaffMemberDirectoryItem {
  if (!pending) return member;
  return Object.freeze({
    ...member,
    padelProfileActive: pending.padel?.active ?? member.padelProfileActive,
    padelRanking: pending.padel?.ranking ?? member.padelRanking,
    tennisProfileActive: pending.tennis?.active ?? member.tennisProfileActive,
    tennisRanking: pending.tennis?.ranking ?? member.tennisRanking,
    accountRole: pending.role ?? member.accountRole,
  });
}

export function activeFilterCount(filters: MemberFilters): number {
  return Number(filters.account !== "all") + Number(filters.sport !== "all") + Number(filters.level !== "all");
}

export function filterMembers(
  members: readonly StaffMemberDirectoryItem[],
  filters: MemberFilters,
): StaffMemberDirectoryItem[] {
  const query = filters.query.trim().toLocaleLowerCase("nl-NL");
  return members.filter((member) => {
    if (query && !member.displayName.toLocaleLowerCase("nl-NL").includes(query) &&
      !member.loginEmail?.toLocaleLowerCase("en-US").includes(query)) return false;
    if (filters.account === "linked" && !member.accountLinked) return false;
    if (filters.account === "unlinked" && member.accountLinked) return false;
    if (filters.sport === "padel" && !member.padelProfileActive) return false;
    if (filters.sport === "tennis" && !member.tennisProfileActive) return false;
    if (filters.sport === "both" && (!member.padelProfileActive || !member.tennisProfileActive)) return false;
    if (filters.level === "missing" && !(
      (member.padelProfileActive && member.padelRanking === null) ||
      (member.tennisProfileActive && member.tennisRanking === null)
    )) return false;
    return true;
  });
}
