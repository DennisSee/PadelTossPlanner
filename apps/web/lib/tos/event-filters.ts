import { eventAllowsSelfService } from "./time";
import type { TosEvent, TosSport } from "./types";

export type ParticipantStatusFilter = "open" | "closed" | "all";
export type StaffStatusFilter =
  | "current"
  | "all"
  | "open"
  | "closed"
  | "past"
  | "draft"
  | "cancelled";
export type SportFilter = TosSport | "all";

function last(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.at(-1) : value;
}

export function participantFilters(params: {
  status?: string | string[];
  sport?: string | string[];
}): Readonly<{ status: ParticipantStatusFilter; sport: SportFilter }> {
  const status = last(params.status);
  const sport = last(params.sport);
  return Object.freeze({
    status: status === "all" || status === "closed" ? status : "open",
    sport: sport === "padel" || sport === "tennis" ? sport : "all",
  });
}

export function staffFilters(params: {
  status?: string | string[];
  sport?: string | string[];
}): Readonly<{ status: StaffStatusFilter; sport: SportFilter }> {
  const status = last(params.status);
  const sport = last(params.sport);
  const known: readonly StaffStatusFilter[] = [
    "current", "all", "open", "closed", "past", "draft", "cancelled",
  ];
  return Object.freeze({
    status: known.includes(status as StaffStatusFilter)
      ? status as StaffStatusFilter
      : "current",
    sport: sport === "padel" || sport === "tennis" ? sport : "all",
  });
}

export function filterParticipantEvents(
  events: readonly TosEvent[],
  filters: Readonly<{ status: ParticipantStatusFilter; sport: SportFilter }>,
  now: Date,
): TosEvent[] {
  return events.filter((event) => {
    if (filters.sport !== "all" && event.sport !== filters.sport) return false;
    const open = eventAllowsSelfService(event, now);
    return filters.status === "all" || (filters.status === "open" ? open : !open);
  });
}

export function filterStaffEvents(
  events: readonly TosEvent[],
  filters: Readonly<{ status: StaffStatusFilter; sport: SportFilter }>,
  now: Date,
): TosEvent[] {
  return events.filter((event) => {
    if (filters.sport !== "all" && event.sport !== filters.sport) return false;
    const ended = new Date(event.endsAt).getTime() < now.getTime();
    const open = eventAllowsSelfService(event, now);
    switch (filters.status) {
      case "all": return true;
      case "current": return !ended && event.status !== "cancelled";
      case "open": return open;
      case "closed": return !ended && !open && event.status !== "draft" && event.status !== "cancelled";
      case "past": return ended;
      case "draft": return event.status === "draft";
      case "cancelled": return event.status === "cancelled";
    }
  });
}
