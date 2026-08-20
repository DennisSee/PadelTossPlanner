import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { parseOffsetTimestamp } from "./parser";
import type { RegistrationResponse, RegistrationWrite, TosEvent } from "./types";

export const TOS_TIME_ZONE = "Europe/Amsterdam";
export const TIME_INPUT_STEP_SECONDS = 60;
const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

export class InvalidAvailabilityError extends Error {
  constructor() {
    super("De beschikbaarheid is ongeldig of valt buiten de TOS-tijd.");
    this.name = "InvalidAvailabilityError";
  }
}

function date(value: string): Date {
  return new Date(parseOffsetTimestamp(value));
}

export function formatEventDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: TOS_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date(value));
}

export function formatEventClock(value: string): string {
  return formatInTimeZone(date(value), TOS_TIME_ZONE, "HH:mm");
}

export function formatEventDateTime(value: string): string {
  return `${formatEventDate(value)} · ${formatEventClock(value)}`;
}

export function eventAllowsSelfService(
  event: TosEvent,
  now = new Date(),
): boolean {
  return (
    event.status === "open" &&
    (!event.signupDeadline || now <= date(event.signupDeadline))
  );
}

export function eventPresentationStatus(event: TosEvent, now = new Date()): string {
  if (event.status === "cancelled") return "Geannuleerd";
  if (event.status === "draft") return "Concept";
  if (now > date(event.endsAt)) return "Afgelopen";
  if (event.status === "closed") return "Inschrijving gesloten";
  if (!eventAllowsSelfService(event, now)) return "Inschrijving gesloten";
  return "Open voor inschrijving";
}

export function fullEventAvailability(event: TosEvent): Readonly<{
  from: string;
  until: string;
}> {
  return Object.freeze({
    from: formatEventClock(event.startsAt),
    until: formatEventClock(event.endsAt),
  });
}

function localDate(value: string): string {
  return formatInTimeZone(date(value), TOS_TIME_ZONE, "yyyy-MM-dd");
}

function localTimestamp(datePart: string, clock: string): Date {
  if (!CLOCK_PATTERN.test(clock)) throw new InvalidAvailabilityError();
  const localValue = `${datePart} ${clock}`;
  const candidate = fromZonedTime(`${datePart}T${clock}:00`, TOS_TIME_ZONE);
  if (
    Number.isNaN(candidate.getTime()) ||
    formatInTimeZone(candidate, TOS_TIME_ZONE, "yyyy-MM-dd HH:mm") !== localValue
  ) {
    throw new InvalidAvailabilityError();
  }
  for (let minutes = -180; minutes <= 180; minutes += 15) {
    if (minutes === 0) continue;
    const alternative = new Date(candidate.getTime() + minutes * 60_000);
    if (formatInTimeZone(alternative, TOS_TIME_ZONE, "yyyy-MM-dd HH:mm") === localValue) {
      throw new InvalidAvailabilityError();
    }
  }
  return candidate;
}

export function normalizeAvailability(
  event: TosEvent,
  response: RegistrationResponse,
  availableFrom: string,
  availableUntil: string,
): RegistrationWrite {
  if (response === "declined") {
    return Object.freeze({
      response,
      availableFrom: null,
      availableUntil: null,
    });
  }
  const from = localTimestamp(localDate(event.startsAt), availableFrom);
  const until = localTimestamp(localDate(event.endsAt), availableUntil);
  if (from < date(event.startsAt) || until > date(event.endsAt) || until <= from) {
    throw new InvalidAvailabilityError();
  }
  return Object.freeze({
    response,
    availableFrom: from.toISOString(),
    availableUntil: until.toISOString(),
  });
}
