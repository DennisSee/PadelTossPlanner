import type {
  OwnRegistrationPosition,
  OwnRegistrationWithEvent,
  TosEvent,
} from "./types";
import { eventAllowsSelfService } from "./time";

export type HomeEventSelection = Readonly<{
  event: TosEvent;
  registration?: OwnRegistrationWithEvent;
  position: OwnRegistrationPosition | null;
  kind: "live-placed" | "future-placed" | "future-waitlist" | "open";
}>;

function compare(left: TosEvent, right: TosEvent): number {
  return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()
    || left.slug.localeCompare(right.slug)
    || left.id.localeCompare(right.id);
}

export function homeOverviewEvents(
  events: readonly TosEvent[],
  selected: HomeEventSelection | null,
  now: Date,
  registrations: readonly OwnRegistrationWithEvent[] = [],
  positions: ReadonlyMap<string, OwnRegistrationPosition | null> = new Map(),
): TosEvent[] {
  const byId = new Map(events
    .filter((event) => eventAllowsSelfService(event, now) && new Date(event.endsAt) > now)
    .map((event) => [event.id, event]));
  // Keep the personal TOS reachable after signup closes, without a second card.
  if (selected) byId.set(selected.event.id, selected.event);
  for (const registration of registrations) {
    if (registration.response === "attending" && positions.get(registration.eventId)?.placementStatus === "placed" &&
      ["open", "closed"].includes(registration.event.status) && new Date(registration.event.endsAt) > now) {
      byId.set(registration.eventId, registration.event);
    }
  }
  return [...byId.values()].sort(compare);
}

export function selectHomeEvent(
  events: readonly TosEvent[],
  registrations: readonly OwnRegistrationWithEvent[],
  positions: ReadonlyMap<string, OwnRegistrationPosition | null>,
  now: Date,
): HomeEventSelection | null {
  const timestamp = now.getTime();
  const candidates = registrations
    .filter((registration) => registration.event.status !== "cancelled")
    .map((registration) => ({ registration, position: positions.get(registration.eventId) ?? null }))
    .sort((left, right) => compare(left.registration.event, right.registration.event));
  const live = candidates.find(({ registration, position }) =>
    registration.response === "attending" && position?.placementStatus === "placed" &&
    new Date(registration.event.startsAt).getTime() <= timestamp &&
    new Date(registration.event.endsAt).getTime() > timestamp,
  );
  if (live) return { event: live.registration.event, registration: live.registration, position: live.position, kind: "live-placed" };
  const placed = candidates.find(({ registration, position }) =>
    registration.response === "attending" && position?.placementStatus === "placed" &&
    new Date(registration.event.startsAt).getTime() > timestamp,
  );
  if (placed) return { event: placed.registration.event, registration: placed.registration, position: placed.position, kind: "future-placed" };
  const waitlist = candidates.find(({ registration, position }) =>
    registration.response === "attending" && position?.placementStatus === "waitlist" &&
    new Date(registration.event.endsAt).getTime() > timestamp,
  );
  if (waitlist) return { event: waitlist.registration.event, registration: waitlist.registration, position: waitlist.position, kind: "future-waitlist" };
  const open = [...events]
    .filter((event) => eventAllowsSelfService(event, now) && new Date(event.endsAt).getTime() > timestamp)
    .sort(compare)[0];
  return open ? { event: open, registration: registrations.find((item) => item.eventId === open.id), position: positions.get(open.id) ?? null, kind: "open" } : null;
}
