import {
  type MemberApprovalStatus,
  type RegistrationResponse,
  type StaffPlannerInput,
} from "./types";
import { InvalidTosDataError, isUuid, parseOffsetTimestamp } from "./parser";

const RESPONSES = new Set<RegistrationResponse>(["attending", "declined"]);
const APPROVAL_STATUSES = new Set<MemberApprovalStatus>([
  "pending",
  "approved",
  "rejected",
]);
const EXPECTED_FIELDS = [
  "registration_id",
  "user_id",
  "member_id",
  "response",
  "available_from",
  "available_until",
  "registration_updated_at",
  "display_name",
  "approval_status",
  "member_active",
  "sport_profile_active",
  "ranking",
] as const;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidTosDataError();
  }
  return value as Record<string, unknown>;
}

function exactFields(row: Record<string, unknown>): boolean {
  const keys = Object.keys(row).sort();
  const expected = [...EXPECTED_FIELDS].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !isUuid(value)) throw new InvalidTosDataError();
  return value;
}

function optionalTimestamp(value: unknown): string | null {
  return value === null ? null : parseOffsetTimestamp(value);
}

function exactBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new InvalidTosDataError();
  return value;
}

function ranking(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || typeof value !== "number" || value < 1 || value > 5) {
    throw new InvalidTosDataError();
  }
  return value;
}

export function parseStaffPlannerInput(value: unknown): StaffPlannerInput {
  const row = record(value);
  if (!exactFields(row)) throw new InvalidTosDataError();
  const response = row.response;
  const approvalStatus = row.approval_status;
  const rawDisplayName = typeof row.display_name === "string" ? row.display_name : "";
  const displayName = rawDisplayName.trim();
  if (
    typeof response !== "string" ||
    !RESPONSES.has(response as RegistrationResponse) ||
    typeof approvalStatus !== "string" ||
    !APPROVAL_STATUSES.has(approvalStatus as MemberApprovalStatus) ||
    !displayName ||
    displayName.length > 120 ||
    CONTROL_CHARACTER_PATTERN.test(rawDisplayName)
  ) {
    throw new InvalidTosDataError();
  }
  return Object.freeze({
    registrationId: uuid(row.registration_id),
    userId: uuid(row.user_id),
    memberId: uuid(row.member_id),
    response: response as RegistrationResponse,
    availableFrom: optionalTimestamp(row.available_from),
    availableUntil: optionalTimestamp(row.available_until),
    registrationUpdatedAt: parseOffsetTimestamp(row.registration_updated_at),
    displayName,
    approvalStatus: approvalStatus as MemberApprovalStatus,
    memberActive: exactBoolean(row.member_active),
    sportProfileActive: exactBoolean(row.sport_profile_active),
    ranking: ranking(row.ranking),
  });
}

export function parseStaffPlannerInputRows(value: unknown): StaffPlannerInput[] {
  if (!Array.isArray(value)) throw new InvalidTosDataError();
  return value.map(parseStaffPlannerInput);
}
