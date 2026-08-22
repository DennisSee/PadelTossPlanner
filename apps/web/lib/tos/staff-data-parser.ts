import { InvalidTosDataError, isUuid, rows } from "./parser";
import { parseStaffPlannerInput } from "./staff-planner-input-parser";
import type {
  MemberApprovalStatus,
  RegistrationPlacement,
  StaffEventCapacity,
  StaffMemberDirectoryItem,
  StaffRegistrationOverview,
} from "./types";

const CONTROL = /[\u0000-\u001f\u007f]/u;
const APPROVALS = new Set<MemberApprovalStatus>(["pending", "approved", "rejected"]);
const PLACEMENTS = new Set<RegistrationPlacement>(["placed", "waitlist", "declined"]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidTosDataError();
  }
  return value as Record<string, unknown>;
}

function exact(row: Record<string, unknown>, fields: readonly string[]): void {
  const actual = Object.keys(row).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new InvalidTosDataError();
  }
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !isUuid(value)) throw new InvalidTosDataError();
  return value;
}

function integer(value: unknown, minimum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new InvalidTosDataError();
  }
  return value;
}

function nullableRanking(value: unknown): number | null {
  if (value === null) return null;
  const parsed = integer(value, 1);
  if (parsed > 5) throw new InvalidTosDataError();
  return parsed;
}

function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new InvalidTosDataError();
  return value;
}

function name(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 120 || CONTROL.test(value)) {
    throw new InvalidTosDataError();
  }
  return value.trim();
}

function nullableEmail(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > 320 ||
    CONTROL.test(value) ||
    /\s/u.test(value)
  ) {
    throw new InvalidTosDataError();
  }
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (!normalized || !normalized.includes("@")) throw new InvalidTosDataError();
  return normalized;
}

export function parseStaffEventCapacityRows(value: unknown): StaffEventCapacity[] {
  return rows(value).map((row) => {
    exact(row, ["event_id", "max_participants", "placed_count", "available_count", "waitlist_count"]);
    const maxParticipants = integer(row.max_participants, 1);
    const placedCount = integer(row.placed_count, 0);
    const availableCount = integer(row.available_count, 0);
    const waitlistCount = integer(row.waitlist_count, 0);
    if (placedCount > maxParticipants || availableCount !== maxParticipants - placedCount) {
      throw new InvalidTosDataError();
    }
    return Object.freeze({
      eventId: uuid(row.event_id),
      maxParticipants,
      placedCount,
      availableCount,
      waitlistCount,
    });
  });
}

export function parseStaffRegistrationOverviewRows(value: unknown): StaffRegistrationOverview[] {
  return rows(value).map((row) => {
    const overviewFields = [
      "registration_id", "user_id", "member_id", "response", "available_from",
      "available_until", "registration_updated_at", "display_name", "approval_status",
      "member_active", "sport_profile_active", "ranking", "placement_status",
      "waitlist_position",
    ] as const;
    exact(row, overviewFields);
    const base = parseStaffPlannerInput(Object.fromEntries(
      Object.entries(row).filter(([key]) => key !== "placement_status" && key !== "waitlist_position"),
    ));
    const placement = row.placement_status;
    if (typeof placement !== "string" || !PLACEMENTS.has(placement as RegistrationPlacement)) {
      throw new InvalidTosDataError();
    }
    const waitlistPosition = row.waitlist_position === null ? null : integer(row.waitlist_position, 1);
    if (
      (placement === "waitlist" && waitlistPosition === null) ||
      (placement !== "waitlist" && waitlistPosition !== null) ||
      (placement === "declined" && base.response !== "declined") ||
      (placement !== "declined" && base.response !== "attending")
    ) {
      throw new InvalidTosDataError();
    }
    return Object.freeze({
      ...base,
      placementStatus: placement as RegistrationPlacement,
      waitlistPosition,
    });
  });
}

export function parseStaffMemberDirectoryRows(value: unknown): StaffMemberDirectoryItem[] {
  return rows(value).map((row) => {
    exact(row, [
      "member_id", "display_name", "login_email", "approval_status", "member_active", "account_linked",
      "padel_profile_active", "padel_ranking", "tennis_profile_active", "tennis_ranking",
    ]);
    const approval = row.approval_status;
    if (typeof approval !== "string" || !APPROVALS.has(approval as MemberApprovalStatus)) {
      throw new InvalidTosDataError();
    }
    return Object.freeze({
      memberId: uuid(row.member_id),
      displayName: name(row.display_name),
      loginEmail: nullableEmail(row.login_email),
      approvalStatus: approval as MemberApprovalStatus,
      memberActive: bool(row.member_active),
      accountLinked: bool(row.account_linked),
      padelProfileActive: bool(row.padel_profile_active),
      padelRanking: nullableRanking(row.padel_ranking),
      tennisProfileActive: bool(row.tennis_profile_active),
      tennisRanking: nullableRanking(row.tennis_ranking),
    });
  });
}

export function parseStaffSportProfileWriteResult(value: unknown) {
  const result = rows(value);
  if (result.length !== 1) throw new InvalidTosDataError();
  const row = record(result[0]);
  exact(row, ["member_id", "sport", "active", "ranking"]);
  const sport = row.sport;
  if (sport !== "padel" && sport !== "tennis") throw new InvalidTosDataError();
  return Object.freeze({
    memberId: uuid(row.member_id),
    sport,
    active: bool(row.active),
    ranking: nullableRanking(row.ranking),
  });
}
