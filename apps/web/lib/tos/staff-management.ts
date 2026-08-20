import "server-only";

import { randomBytes } from "node:crypto";
import { formatInTimeZone } from "date-fns-tz";

import { isTosEventSlug } from "./slug";
import {
  InvalidAvailabilityError,
  strictAmsterdamDateTime,
  TOS_TIME_ZONE,
} from "./time";
import type { TosEvent, TosEventStatus, TosSport } from "./types";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const LOCAL_DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)$/u;
const HEX_TOKEN_PATTERN = /^[0-9a-f]{8}$/u;
const SPORTS = new Set<TosSport>(["padel", "tennis"]);
const STATUSES = new Set<TosEventStatus>(["draft", "open", "closed", "cancelled"]);

export type StaffEventCreateWrite = Readonly<{
  slug: string;
  title: string;
  sport: TosSport;
  startsAt: string;
  endsAt: string;
  signupDeadline: string | null;
  status: TosEventStatus;
}>;

export type StaffEventUpdateWrite = Readonly<{
  title: string;
  signupDeadline: string | null;
  status: TosEventStatus;
}>;

export type CreateEventInput = Readonly<{
  title: string;
  sport: string;
  eventDate: string;
  startsAt: string;
  endsAt: string;
  signupDeadline: string;
  status: string;
}>;

export type UpdateEventInput = Readonly<{
  title: string;
  signupDeadline: string;
  status: string;
}>;

export class InvalidStaffEventRequestError extends Error {
  constructor() {
    super("De eventgegevens zijn ongeldig.");
    this.name = "InvalidStaffEventRequestError";
  }
}

function title(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160 || CONTROL_CHARACTERS.test(normalized)) {
    throw new InvalidStaffEventRequestError();
  }
  return normalized;
}

function sport(value: string): TosSport {
  if (!SPORTS.has(value as TosSport)) throw new InvalidStaffEventRequestError();
  return value as TosSport;
}

function status(value: string): TosEventStatus {
  if (!STATUSES.has(value as TosEventStatus)) throw new InvalidStaffEventRequestError();
  return value as TosEventStatus;
}

function strictDate(value: string): string {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new InvalidStaffEventRequestError();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new InvalidStaffEventRequestError();
  }
  return value;
}

function localInstant(datePart: string, clock: string): Date {
  if (!CLOCK_PATTERN.test(clock)) throw new InvalidStaffEventRequestError();
  try {
    return strictAmsterdamDateTime(strictDate(datePart), clock);
  } catch (error) {
    if (error instanceof InvalidAvailabilityError) {
      throw new InvalidStaffEventRequestError();
    }
    throw error;
  }
}

function deadline(value: string, startsAt: Date): string | null {
  if (!value) return null;
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) throw new InvalidStaffEventRequestError();
  const instant = localInstant(match[1], match[2]);
  if (instant > startsAt) throw new InvalidStaffEventRequestError();
  return instant.toISOString();
}

export function generateStaffEventSlug(
  eventSport: TosSport,
  eventDate: string,
  token = randomBytes(4).toString("hex"),
): string {
  const normalizedSport = sport(eventSport);
  const normalizedDate = strictDate(eventDate);
  if (!HEX_TOKEN_PATTERN.test(token)) throw new InvalidStaffEventRequestError();
  const slug = `${normalizedSport}-tos-${normalizedDate.replaceAll("-", "")}-${token}`;
  if (!isTosEventSlug(slug)) throw new InvalidStaffEventRequestError();
  return slug;
}

export function validateCreateEvent(
  input: CreateEventInput,
  token?: string,
): StaffEventCreateWrite {
  const normalizedDate = strictDate(input.eventDate);
  const startsAt = localInstant(normalizedDate, input.startsAt);
  const endsAt = localInstant(normalizedDate, input.endsAt);
  if (endsAt <= startsAt) throw new InvalidStaffEventRequestError();
  const normalizedSport = sport(input.sport);
  return Object.freeze({
    slug: generateStaffEventSlug(normalizedSport, normalizedDate, token),
    title: title(input.title),
    sport: normalizedSport,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    signupDeadline: deadline(input.signupDeadline, startsAt),
    status: status(input.status),
  });
}

export function validateUpdateEvent(
  input: UpdateEventInput,
  event: TosEvent,
): StaffEventUpdateWrite {
  return Object.freeze({
    title: title(input.title),
    signupDeadline: deadline(input.signupDeadline, new Date(event.startsAt)),
    status: status(input.status),
  });
}

function addCalendarDays(value: string, days: number): string {
  const match = DATE_PATTERN.exec(value)!;
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return next.toISOString().slice(0, 10);
}

export function createEventDefaults(now = new Date()) {
  const today = formatInTimeZone(now, TOS_TIME_ZONE, "yyyy-MM-dd");
  const eventDate = addCalendarDays(today, 7);
  return Object.freeze({
    title: "TOS-avond",
    sport: "padel" as const,
    eventDate,
    startsAt: "20:00",
    endsAt: "22:00",
    signupDeadline: `${eventDate}T19:00`,
    status: "draft" as const,
  });
}

export function sameEventCreateWrite(event: TosEvent, write: StaffEventCreateWrite): boolean {
  return (
    event.slug === write.slug &&
    event.title === write.title &&
    event.sport === write.sport &&
    new Date(event.startsAt).getTime() === new Date(write.startsAt).getTime() &&
    new Date(event.endsAt).getTime() === new Date(write.endsAt).getTime() &&
    nullableInstantEqual(event.signupDeadline, write.signupDeadline) &&
    event.status === write.status
  );
}

export function sameEventUpdate(
  before: TosEvent,
  after: TosEvent,
  write: StaffEventUpdateWrite,
): boolean {
  return (
    after.id === before.id &&
    after.slug === before.slug &&
    after.sport === before.sport &&
    new Date(after.startsAt).getTime() === new Date(before.startsAt).getTime() &&
    new Date(after.endsAt).getTime() === new Date(before.endsAt).getTime() &&
    after.title === write.title &&
    nullableInstantEqual(after.signupDeadline, write.signupDeadline) &&
    after.status === write.status
  );
}

function nullableInstantEqual(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  return new Date(left).getTime() === new Date(right).getTime();
}
