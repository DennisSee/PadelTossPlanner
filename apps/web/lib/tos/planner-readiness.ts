import { formatEventClock } from "./time";
import type { StaffPlannerInput, TosEvent, TosSport } from "./types";

export const PLANNER_READINESS = Object.freeze({
  READY: "READY",
  DECLINED: "DECLINED",
  APPROVAL_PENDING: "APPROVAL_PENDING",
  APPROVAL_REJECTED: "APPROVAL_REJECTED",
  MEMBER_INACTIVE: "MEMBER_INACTIVE",
  SPORT_PROFILE_INACTIVE: "SPORT_PROFILE_INACTIVE",
  RANKING_MISSING: "RANKING_MISSING",
  AVAILABILITY_INVALID: "AVAILABILITY_INVALID",
} as const);

export type PlannerReadiness = typeof PLANNER_READINESS[keyof typeof PLANNER_READINESS];

export type AssessedStaffPlannerInput = Readonly<{
  participant: StaffPlannerInput;
  readiness: PlannerReadiness;
}>;

function hasValidAvailability(event: TosEvent, participant: StaffPlannerInput): boolean {
  if (!participant.availableFrom || !participant.availableUntil) return false;
  const eventStart = new Date(event.startsAt).getTime();
  const eventEnd = new Date(event.endsAt).getTime();
  const availableFrom = new Date(participant.availableFrom).getTime();
  const availableUntil = new Date(participant.availableUntil).getTime();
  return (
    Number.isFinite(eventStart) &&
    Number.isFinite(eventEnd) &&
    Number.isFinite(availableFrom) &&
    Number.isFinite(availableUntil) &&
    availableFrom >= eventStart &&
    availableUntil <= eventEnd &&
    availableUntil > availableFrom
  );
}

export function derivePlannerReadiness(
  event: TosEvent,
  participant: StaffPlannerInput,
): PlannerReadiness {
  if (participant.response === "declined") return PLANNER_READINESS.DECLINED;
  if (!hasValidAvailability(event, participant)) return PLANNER_READINESS.AVAILABILITY_INVALID;
  if (participant.approvalStatus === "pending") return PLANNER_READINESS.APPROVAL_PENDING;
  if (participant.approvalStatus === "rejected") return PLANNER_READINESS.APPROVAL_REJECTED;
  if (!participant.memberActive) return PLANNER_READINESS.MEMBER_INACTIVE;
  if (!participant.sportProfileActive) return PLANNER_READINESS.SPORT_PROFILE_INACTIVE;
  if (participant.ranking === null) return PLANNER_READINESS.RANKING_MISSING;
  return PLANNER_READINESS.READY;
}

export function assessStaffPlannerInput(
  event: TosEvent,
  participants: readonly StaffPlannerInput[],
): AssessedStaffPlannerInput[] {
  return participants.map((participant) => Object.freeze({
    participant,
    readiness: derivePlannerReadiness(event, participant),
  }));
}

export function availabilityLabel(event: TosEvent, participant: StaffPlannerInput): string {
  if (!participant.availableFrom || !participant.availableUntil) return "Niet opgegeven";
  if (
    new Date(participant.availableFrom).getTime() === new Date(event.startsAt).getTime() &&
    new Date(participant.availableUntil).getTime() === new Date(event.endsAt).getTime()
  ) {
    return "Hele avond";
  }
  return `${formatEventClock(participant.availableFrom)}–${formatEventClock(participant.availableUntil)}`;
}

export function readinessLabel(readiness: PlannerReadiness, sport: TosSport): string {
  const sportName = sport === "padel" ? "Padel" : "Tennis";
  const labels: Record<PlannerReadiness, string> = {
    READY: sport === "padel" ? "Klaar voor planner" : "Gegevens compleet",
    DECLINED: "Afgemeld",
    APPROVAL_PENDING: "Goedkeuring in behandeling",
    APPROVAL_REJECTED: "Lidmaatschap niet goedgekeurd",
    MEMBER_INACTIVE: "Clublid inactief",
    SPORT_PROFILE_INACTIVE: `${sportName}profiel inactief`,
    RANKING_MISSING: `${sportName}niveau ontbreekt`,
    AVAILABILITY_INVALID: "Beschikbaarheid ongeldig",
  };
  return labels[readiness];
}
