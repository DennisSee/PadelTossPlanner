import { isUuid, parseOffsetTimestamp } from "../tos/parser";
import type {
  ContactDirection,
  ContactStatus,
  HistoryClubmate,
  HistoryContactRequest,
  HistoryEvent,
  HistoryPerson,
  HistoryRound,
  HistoryRoundState,
  HistorySport,
  SharedHistoryEvent,
} from "./types";

const CONTROL = /[\u0000-\u001f\u007f]/u;
const SPORTS = new Set<HistorySport>(["padel", "tennis"]);
const STATES = new Set<HistoryRoundState>(["playing", "rest", "not_arrived", "unavailable"]);
const CONTACT_STATES = new Set<ContactStatus>(["pending", "accepted", "declined", "revoked"]);
const DIRECTIONS = new Set<ContactDirection>(["incoming", "outgoing"]);

export class InvalidHistoryDataError extends Error {
  constructor() {
    super("De historie kon niet worden geladen.");
    this.name = "InvalidHistoryDataError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidHistoryDataError();
  return value as Record<string, unknown>;
}

function exact(row: Record<string, unknown>, fields: readonly string[]): void {
  const actual = Object.keys(row).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new InvalidHistoryDataError();
  }
}

function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new InvalidHistoryDataError();
  return value.map(record);
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !isUuid(value)) throw new InvalidHistoryDataError();
  return value;
}

function nullableUuid(value: unknown): string | null {
  return value === null ? null : uuid(value);
}

function text(value: unknown, maximum = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || CONTROL.test(value)) {
    throw new InvalidHistoryDataError();
  }
  return value.trim();
}

function integer(value: unknown, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new InvalidHistoryDataError();
  }
  return value;
}

function sport(value: unknown): HistorySport {
  if (typeof value !== "string" || !SPORTS.has(value as HistorySport)) throw new InvalidHistoryDataError();
  return value as HistorySport;
}

function timestamp(value: unknown): string {
  return parseOffsetTimestamp(value);
}

function person(value: unknown): HistoryPerson {
  const row = record(value);
  exact(row, ["member_id", "display_name"]);
  return Object.freeze({ memberId: nullableUuid(row.member_id), displayName: text(row.display_name, 120) });
}

function round(value: unknown): HistoryRound {
  const row = record(value);
  exact(row, ["round_number", "starts_at", "ends_at", "state", "court_name", "partners", "opponents"]);
  if (typeof row.state !== "string" || !STATES.has(row.state as HistoryRoundState) ||
      !Array.isArray(row.partners) || !Array.isArray(row.opponents) ||
      (row.court_name !== null && typeof row.court_name !== "string")) throw new InvalidHistoryDataError();
  const state = row.state as HistoryRoundState;
  const courtName = row.court_name === null ? null : text(row.court_name, 120);
  if ((state === "playing") !== Boolean(courtName)) throw new InvalidHistoryDataError();
  return Object.freeze({
    roundNumber: integer(row.round_number, 1), startsAt: timestamp(row.starts_at), endsAt: timestamp(row.ends_at),
    state, courtName, partners: row.partners.map(person), opponents: row.opponents.map(person),
  });
}

export function parseHistoryEvents(value: unknown): HistoryEvent[] {
  return rows(value).map((row) => {
    exact(row, ["event_id", "title", "sport", "starts_at", "ends_at", "match_count", "rest_count", "rounds"]);
    if (!Array.isArray(row.rounds)) throw new InvalidHistoryDataError();
    return Object.freeze({
      eventId: uuid(row.event_id), title: text(row.title), sport: sport(row.sport),
      startsAt: timestamp(row.starts_at), endsAt: timestamp(row.ends_at),
      matchCount: integer(row.match_count), restCount: integer(row.rest_count), rounds: row.rounds.map(round),
    });
  });
}

export function parseHistoryClubmates(value: unknown): HistoryClubmate[] {
  return rows(value).map((row) => {
    exact(row, ["member_id", "display_name", "shared_matches", "shared_events", "last_shared_at"]);
    return Object.freeze({
      memberId: uuid(row.member_id), displayName: text(row.display_name, 120),
      sharedMatches: integer(row.shared_matches, 1), sharedEvents: integer(row.shared_events, 1),
      lastSharedAt: timestamp(row.last_shared_at),
    });
  });
}

export function parseSharedHistory(value: unknown): SharedHistoryEvent[] {
  return rows(value).map((row) => {
    exact(row, ["event_id", "title", "sport", "starts_at", "shared_matches"]);
    return Object.freeze({
      eventId: uuid(row.event_id), title: text(row.title), sport: sport(row.sport),
      startsAt: timestamp(row.starts_at), sharedMatches: integer(row.shared_matches, 1),
    });
  });
}

export function parseContactRequests(value: unknown): HistoryContactRequest[] {
  return rows(value).map((row) => {
    exact(row, ["request_id", "other_member_id", "display_name", "status", "direction", "created_at", "responded_at"]);
    if (typeof row.status !== "string" || !CONTACT_STATES.has(row.status as ContactStatus) ||
        typeof row.direction !== "string" || !DIRECTIONS.has(row.direction as ContactDirection)) {
      throw new InvalidHistoryDataError();
    }
    return Object.freeze({
      requestId: uuid(row.request_id), otherMemberId: uuid(row.other_member_id),
      displayName: text(row.display_name, 120), status: row.status as ContactStatus,
      direction: row.direction as ContactDirection, createdAt: timestamp(row.created_at),
      respondedAt: row.responded_at === null ? null : timestamp(row.responded_at),
    });
  });
}

export function parseAcceptedContactEmail(value: unknown): string | null {
  const result = rows(value);
  if (result.length === 0) return null;
  if (result.length !== 1) throw new InvalidHistoryDataError();
  exact(result[0], ["contact_email"]);
  const email = result[0].contact_email;
  if (typeof email !== "string" || email.length > 320 || CONTROL.test(email) || /\s/u.test(email) || !email.includes("@")) {
    throw new InvalidHistoryDataError();
  }
  return email.toLocaleLowerCase("en-US");
}
