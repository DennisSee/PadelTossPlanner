export type AccountRole = "participant" | "planner" | "admin";
export type MembershipState =
  | "missing"
  | "pending"
  | "approved"
  | "rejected"
  | "inactive"
  | "inconsistent";

export type AccountIdentity = Readonly<{ userId: string; email: string }>;
export type AccountProfile = Readonly<{
  displayName: string;
  role: AccountRole | null;
  active: boolean;
  memberId: string | null;
}>;
export type AccountMembership = Readonly<{
  state: MembershipState;
  memberId: string | null;
  displayName: string | null;
}>;
export type AccountCapabilities = Readonly<{
  canParticipate: boolean;
  canPlan: boolean;
  canAdminister: boolean;
}>;
export type AccountContext = Readonly<{
  identity: AccountIdentity;
  profile: AccountProfile | null;
  membership: AccountMembership;
  capabilities: AccountCapabilities;
}>;

export type ProfileRecord = Readonly<{
  id: string;
  display_name: string | null;
  role: string | null;
  active: boolean;
  member_id: string | null;
}>;
export type MemberRecord = Readonly<{
  id: string;
  display_name: string | null;
  approval_status: string | null;
  active: boolean;
}>;

const ACCOUNT_ROLES = new Set<AccountRole>(["participant", "planner", "admin"]);

function knownRole(value: string | null): AccountRole | null {
  return ACCOUNT_ROLES.has(value as AccountRole) ? (value as AccountRole) : null;
}

function membershipState(
  profile: ProfileRecord | null,
  member: MemberRecord | null,
): MembershipState {
  if (!profile) return "inconsistent";
  if (!profile.active) return "inactive";
  if (!profile.member_id) return member ? "inconsistent" : "missing";
  if (!member || member.id !== profile.member_id) return "inconsistent";
  if (!member.active) return "inactive";
  if (member.approval_status === "pending") return "pending";
  if (member.approval_status === "rejected") return "rejected";
  return member.approval_status === "approved" ? "approved" : "inconsistent";
}

export function deriveAccountContext(
  identity: AccountIdentity,
  profileRecord: ProfileRecord | null,
  memberRecord: MemberRecord | null,
): AccountContext {
  const role = knownRole(profileRecord?.role ?? null);
  const profile = profileRecord
    ? Object.freeze({
        displayName: profileRecord.display_name?.trim() || identity.email,
        role,
        active: profileRecord.active,
        memberId: profileRecord.member_id,
      })
    : null;
  const state = membershipState(profileRecord, memberRecord);
  const profileActive = Boolean(profile?.active && role);
  const membership = Object.freeze({
    state,
    memberId: state === "inconsistent" ? null : (memberRecord?.id ?? null),
    displayName: state === "inconsistent" ? null : (memberRecord?.display_name ?? null),
  });
  const capabilities = Object.freeze({
    canParticipate: profileActive && state === "approved",
    canPlan: profileActive && (role === "planner" || role === "admin"),
    canAdminister: profileActive && role === "admin",
  });
  return Object.freeze({
    identity: Object.freeze({ ...identity }),
    profile,
    membership,
    capabilities,
  });
}
