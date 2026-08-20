import type { OwnRegistrationWithEvent, TosEvent } from "./types";

export function sortEvents(events: readonly TosEvent[]): TosEvent[] {
  return [...events].sort(
    (left, right) =>
      new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
  );
}

export function sortRegistrations(
  registrations: readonly OwnRegistrationWithEvent[],
): OwnRegistrationWithEvent[] {
  return [...registrations].sort(
    (left, right) =>
      new Date(left.event.startsAt).getTime() -
      new Date(right.event.startsAt).getTime(),
  );
}

export function eventsWithoutOwnRegistration(
  events: readonly TosEvent[],
  registrations: readonly OwnRegistrationWithEvent[],
): TosEvent[] {
  const registeredEventIds = new Set(
    registrations.map((registration) => registration.eventId),
  );
  return sortEvents(events.filter((event) => !registeredEventIds.has(event.id)));
}

export function attendeeNamesPreview(
  names: readonly string[],
  visible = 4,
): string {
  if (visible < 1) throw new Error("Minimaal één naam moet zichtbaar kunnen zijn.");
  const shown = names.slice(0, visible);
  const remaining = names.length - shown.length;
  return `${shown.join(" · ")}${remaining > 0 ? ` · +${remaining}` : ""}`;
}
