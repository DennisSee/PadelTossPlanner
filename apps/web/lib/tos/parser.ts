import {
  type OwnRegistration,
  type OwnRegistrationWithEvent,
  type RegistrationResponse,
  type TosEvent,
  type TosEventStatus,
  type TosSport,
} from "./types";
import { isTosEventSlug } from "./slug";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OFFSET_TIMESTAMP_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/u;
const SPORTS = new Set<TosSport>(["padel", "tennis"]);
const EVENT_STATUSES = new Set<TosEventStatus>([
  "draft",
  "open",
  "closed",
  "cancelled",
]);
const RESPONSES = new Set<RegistrationResponse>(["attending", "declined"]);

export class InvalidTosDataError extends Error {
  constructor() {
    super("De TOS-gegevens hebben een onbekend formaat.");
    this.name = "InvalidTosDataError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidTosDataError();
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, maximum = 500): string {
  if (typeof value !== "string" || !value || value.length > maximum) {
    throw new InvalidTosDataError();
  }
  return value;
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function parseOffsetTimestamp(value: unknown): string {
  const timestamp = stringValue(value, 64);
  const parsed = new Date(timestamp);
  if (!OFFSET_TIMESTAMP_PATTERN.test(timestamp) || Number.isNaN(parsed.getTime())) {
    throw new InvalidTosDataError();
  }
  return timestamp;
}

function nullableOffsetTimestamp(value: unknown): string | null {
  return value === null ? null : parseOffsetTimestamp(value);
}

export function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new InvalidTosDataError();
  return value.map(record);
}

export function parseTosEvent(value: unknown): TosEvent {
  const row = record(value);
  const id = stringValue(row.id, 64);
  const slug = stringValue(row.slug, 80);
  const title = stringValue(row.title, 160).trim();
  const sport = stringValue(row.sport, 16) as TosSport;
  const status = stringValue(row.status, 16) as TosEventStatus;
  if (
    !isUuid(id) ||
    !isTosEventSlug(slug) ||
    !title ||
    !SPORTS.has(sport) ||
    !EVENT_STATUSES.has(status)
  ) {
    throw new InvalidTosDataError();
  }
  const startsAt = parseOffsetTimestamp(row.starts_at);
  const endsAt = parseOffsetTimestamp(row.ends_at);
  const signupDeadline = nullableOffsetTimestamp(row.signup_deadline);
  if (new Date(endsAt) <= new Date(startsAt)) throw new InvalidTosDataError();
  return Object.freeze({
    id,
    slug,
    title,
    sport,
    startsAt,
    endsAt,
    signupDeadline,
    status,
  });
}

export function parseOwnRegistration(value: unknown): OwnRegistration {
  const row = record(value);
  const id = stringValue(row.id, 64);
  const eventId = stringValue(row.event_id, 64);
  const response = stringValue(row.response, 16) as RegistrationResponse;
  if (!isUuid(id) || !isUuid(eventId) || !RESPONSES.has(response)) {
    throw new InvalidTosDataError();
  }
  const availableFrom = nullableOffsetTimestamp(row.available_from);
  const availableUntil = nullableOffsetTimestamp(row.available_until);
  if (
    (response === "attending" &&
      (!availableFrom ||
        !availableUntil ||
        new Date(availableUntil) <= new Date(availableFrom))) ||
    (response === "declined" && (availableFrom !== null || availableUntil !== null))
  ) {
    throw new InvalidTosDataError();
  }
  return Object.freeze({
    id,
    eventId,
    response,
    availableFrom,
    availableUntil,
    createdAt: parseOffsetTimestamp(row.created_at),
    updatedAt: parseOffsetTimestamp(row.updated_at),
  });
}

export function parseOwnRegistrationWithEvent(
  value: unknown,
): OwnRegistrationWithEvent {
  const row = record(value);
  const relation = Array.isArray(row.tos_events)
    ? row.tos_events.length === 1
      ? row.tos_events[0]
      : null
    : row.tos_events;
  if (!relation) throw new InvalidTosDataError();
  const registration = parseOwnRegistration(row);
  const event = parseTosEvent(relation);
  if (registration.eventId !== event.id) throw new InvalidTosDataError();
  return Object.freeze({ ...registration, event });
}

export function parseAttendeeNames(value: unknown): string[] {
  return rows(value).map((row) => {
    if (
      Object.keys(row).length !== 1 ||
      typeof row.display_name !== "string" ||
      !row.display_name.trim() ||
      row.display_name.length > 120
    ) {
      throw new InvalidTosDataError();
    }
    return row.display_name.trim();
  });
}
