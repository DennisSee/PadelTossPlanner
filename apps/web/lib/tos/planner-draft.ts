import {
  PLANNER_COURTS,
  PLANNER_SEARCH_PROFILES,
  type EditablePlannerPlayer,
  type PlannerCourt,
  type PlannerDraft,
  type PlannerDraftWrite,
  type PlannerPlayer,
  type StaffPlannerInput,
  type TosEvent,
} from "./types";
import { derivePlannerReadiness, PLANNER_READINESS } from "./planner-readiness";
import { formatEventClock } from "./time";
import { isUuid, parseOffsetTimestamp } from "./parser";

const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const MATCH_MINUTES = new Set([15, 20, 25, 30]);
const PRIVATE_PLAYER_KEYS = new Set([
  "row_id", "name", "ranking", "included", "available_from", "available_until",
  "member_id", "user_id", "registration_id", "registration_updated_at", "source_event_id",
]);

export class InvalidPlannerDraftError extends Error {
  constructor() {
    super("De plannerinstellingen zijn ongeldig.");
    this.name = "InvalidPlannerDraftError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidPlannerDraftError();
  return value as Record<string, unknown>;
}

function nullableUuid(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !isUuid(value)) throw new InvalidPlannerDraftError();
  return value;
}

function player(value: unknown): PlannerPlayer {
  const row = record(value);
  if (Object.keys(row).some((key) => !PRIVATE_PLAYER_KEYS.has(key))) throw new InvalidPlannerDraftError();
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (
    typeof row.row_id !== "string" || !isUuid(row.row_id) || !name || name.length > 120 ||
    CONTROL.test(String(row.name ?? "")) || typeof row.ranking !== "number" ||
    !Number.isInteger(row.ranking) || row.ranking < 1 || row.ranking > 5 ||
    typeof row.included !== "boolean" ||
    (row.available_from !== null && (typeof row.available_from !== "string" || !CLOCK.test(row.available_from))) ||
    (row.available_until !== null && (typeof row.available_until !== "string" || !CLOCK.test(row.available_until)))
  ) throw new InvalidPlannerDraftError();
  const registrationUpdatedAt = row.registration_updated_at === undefined
    ? undefined
    : parseOffsetTimestamp(row.registration_updated_at);
  return Object.freeze({
    rowId: row.row_id,
    name,
    ranking: row.ranking,
    included: row.included,
    availableFrom: row.available_from,
    availableUntil: row.available_until,
    memberId: nullableUuid(row.member_id),
    userId: nullableUuid(row.user_id),
    registrationId: nullableUuid(row.registration_id),
    registrationUpdatedAt,
    sourceEventId: nullableUuid(row.source_event_id),
  });
}

function serializePlayer(value: PlannerPlayer): Record<string, unknown> {
  return Object.fromEntries(Object.entries({
    row_id: value.rowId,
    name: value.name,
    ranking: value.ranking,
    included: value.included,
    available_from: value.availableFrom,
    available_until: value.availableUntil,
    member_id: value.memberId,
    user_id: value.userId,
    registration_id: value.registrationId,
    registration_updated_at: value.registrationUpdatedAt,
    source_event_id: value.sourceEventId,
  }).filter(([, entry]) => entry !== undefined));
}

function rows(value: unknown): PlannerPlayer[] {
  if (!Array.isArray(value) || value.length > 160) throw new InvalidPlannerDraftError();
  const parsed = value.map(player);
  const rowIds = new Set<string>();
  const names = new Set<string>();
  for (const item of parsed) {
    const name = item.name.toLocaleLowerCase("nl-NL");
    if (rowIds.has(item.rowId) || names.has(name)) throw new InvalidPlannerDraftError();
    rowIds.add(item.rowId);
    names.add(name);
  }
  return parsed;
}

function courts(value: unknown): PlannerCourt[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PLANNER_COURTS.length) {
    throw new InvalidPlannerDraftError();
  }
  const valid = new Set<string>(PLANNER_COURTS);
  if (value.some((entry) => typeof entry !== "string" || !valid.has(entry)) || new Set(value).size !== value.length) {
    throw new InvalidPlannerDraftError();
  }
  return value as PlannerCourt[];
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value < minimum || value > maximum) {
    throw new InvalidPlannerDraftError();
  }
  return value;
}

function timestampOrNull(value: unknown): string | null {
  return value === null ? null : parseOffsetTimestamp(value);
}

export function emptyPlannerDraft(event: TosEvent): PlannerDraft {
  return Object.freeze({
    eventId: event.id,
    players: [],
    selectedCourts: PLANNER_COURTS.slice(0, 2),
    matchMinutes: 20,
    restMinutes: 0,
    searchProfile: "Normaal",
    allowRepeatPartners: false,
    levelMix: 50,
    teamDifferenceTolerance: 0.5,
    revision: 0,
    updatedBy: null,
    updatedByName: null,
    updatedAt: null,
    createdAt: null,
  });
}

export function parsePlannerDraftRow(value: unknown): PlannerDraft {
  const row = record(value);
  const expected = new Set([
    "event_id", "players", "selected_courts", "match_minutes", "rest_minutes",
    "search_profile", "allow_repeat_partners", "level_mix",
    "team_difference_tolerance", "revision", "updated_by", "updated_by_name",
    "updated_at", "created_at",
  ]);
  if (Object.keys(row).length !== expected.size || Object.keys(row).some((key) => !expected.has(key))) {
    throw new InvalidPlannerDraftError();
  }
  const matchMinutes = integer(row.match_minutes, 15, 30);
  if (!MATCH_MINUTES.has(matchMinutes)) throw new InvalidPlannerDraftError();
  if (typeof row.event_id !== "string" || !isUuid(row.event_id)) throw new InvalidPlannerDraftError();
  if (typeof row.search_profile !== "string" || !PLANNER_SEARCH_PROFILES.includes(row.search_profile as never)) {
    throw new InvalidPlannerDraftError();
  }
  if (typeof row.allow_repeat_partners !== "boolean" || typeof row.team_difference_tolerance !== "number" ||
      row.team_difference_tolerance < 0 || row.team_difference_tolerance > 1.5) throw new InvalidPlannerDraftError();
  const updatedBy = row.updated_by === null ? null : nullableUuid(row.updated_by) ?? null;
  const updatedByName = row.updated_by_name === null ? null : String(row.updated_by_name).trim();
  if (updatedByName !== null && (!updatedByName || updatedByName.length > 120 || CONTROL.test(updatedByName))) {
    throw new InvalidPlannerDraftError();
  }
  return Object.freeze({
    eventId: row.event_id,
    players: rows(row.players),
    selectedCourts: courts(row.selected_courts),
    matchMinutes: matchMinutes as 15 | 20 | 25 | 30,
    restMinutes: integer(row.rest_minutes, 0, 30),
    searchProfile: row.search_profile as PlannerDraft["searchProfile"],
    allowRepeatPartners: row.allow_repeat_partners,
    levelMix: integer(row.level_mix, 0, 100),
    teamDifferenceTolerance: row.team_difference_tolerance,
    revision: integer(row.revision, 1, Number.MAX_SAFE_INTEGER),
    updatedBy,
    updatedByName,
    updatedAt: timestampOrNull(row.updated_at),
    createdAt: timestampOrNull(row.created_at),
  });
}

export function editablePlannerPlayers(event: TosEvent, players: readonly PlannerPlayer[]): EditablePlannerPlayer[] {
  return players.map((item) => Object.freeze({
    rowId: item.rowId,
    name: item.name,
    ranking: item.ranking,
    included: item.included,
    availableFrom: item.availableFrom ?? formatEventClock(event.startsAt),
    availableUntil: item.availableUntil ?? formatEventClock(event.endsAt),
    linked: Boolean(item.memberId),
  }));
}

function clockMinutes(clock: string): number {
  if (!CLOCK.test(clock)) throw new InvalidPlannerDraftError();
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 60 + minutes;
}

export function validatePlannerAvailability(event: TosEvent, from: string, until: string): void {
  const start = clockMinutes(formatEventClock(event.startsAt));
  let end = clockMinutes(formatEventClock(event.endsAt));
  if (end <= start) end += 24 * 60;
  let fromValue = clockMinutes(from);
  let untilValue = clockMinutes(until);
  if (fromValue < start) fromValue += 24 * 60;
  if (untilValue <= start) untilValue += 24 * 60;
  if (fromValue < start || untilValue > end || untilValue <= fromValue) throw new InvalidPlannerDraftError();
}

export function reconcileEditableDraft(
  event: TosEvent,
  current: PlannerDraft,
  editable: readonly Omit<EditablePlannerPlayer, "linked">[],
  settings: Omit<PlannerDraftWrite, "players">,
  createRowId: () => string,
): PlannerDraftWrite {
  if (editable.length > 160) throw new InvalidPlannerDraftError();
  const known = new Map(current.players.map((item) => [item.rowId, item]));
  const used = new Set<string>();
  const result: PlannerPlayer[] = [];
  for (const input of editable) {
    const name = input.name.trim();
    const existing = input.rowId ? known.get(input.rowId) : undefined;
    if (input.rowId && (!existing || used.has(input.rowId))) throw new InvalidPlannerDraftError();
    const rowId = existing?.rowId ?? createRowId();
    if (!isUuid(rowId) || !name || name.length > 120 || CONTROL.test(input.name) ||
        typeof input.ranking !== "number" || !Number.isInteger(input.ranking) || input.ranking < 1 || input.ranking > 5 ||
        typeof input.included !== "boolean") throw new InvalidPlannerDraftError();
    validatePlannerAvailability(event, input.availableFrom, input.availableUntil);
    used.add(rowId);
    const value: Record<string, unknown> = {
      rowId, name, ranking: input.ranking, included: input.included,
      availableFrom: input.availableFrom, availableUntil: input.availableUntil,
    };
    for (const [key, identity] of Object.entries({
      memberId: existing?.memberId, userId: existing?.userId,
      registrationId: existing?.registrationId, registrationUpdatedAt: existing?.registrationUpdatedAt,
      sourceEventId: existing?.sourceEventId,
    })) if (identity !== undefined) value[key] = identity;
    result.push(Object.freeze(value) as PlannerPlayer);
  }
  rows(result.map(serializePlayer));
  courts(settings.selectedCourts);
  if (!MATCH_MINUTES.has(settings.matchMinutes) || !Number.isInteger(settings.restMinutes) || settings.restMinutes < 0 || settings.restMinutes > 30 ||
      !PLANNER_SEARCH_PROFILES.includes(settings.searchProfile) || typeof settings.allowRepeatPartners !== "boolean" ||
      !Number.isInteger(settings.levelMix) || settings.levelMix < 0 || settings.levelMix > 100 ||
      !Number.isFinite(settings.teamDifferenceTolerance) || settings.teamDifferenceTolerance < 0 || settings.teamDifferenceTolerance > 1.5) {
    throw new InvalidPlannerDraftError();
  }
  return Object.freeze({ ...settings, players: result });
}

export function plannerPlayersJson(players: readonly PlannerPlayer[]): unknown[] {
  return players.map(serializePlayer);
}

export function plannerDraftMatchesWrite(
  stored: PlannerDraft,
  write: PlannerDraftWrite,
  expectedRevision: number,
): boolean {
  return stored.revision === expectedRevision &&
    JSON.stringify(plannerPlayersJson(stored.players)) === JSON.stringify(plannerPlayersJson(write.players)) &&
    JSON.stringify(stored.selectedCourts) === JSON.stringify(write.selectedCourts) &&
    stored.matchMinutes === write.matchMinutes && stored.restMinutes === write.restMinutes &&
    stored.searchProfile === write.searchProfile && stored.allowRepeatPartners === write.allowRepeatPartners &&
    stored.levelMix === write.levelMix && stored.teamDifferenceTolerance === write.teamDifferenceTolerance;
}

export type ImportDisposition =
  | "add" | "update" | "unchanged" | "declined" | "approval" | "member"
  | "sport-profile" | "ranking" | "availability" | "identity-conflict" | "legacy-name-conflict";
export type ImportPreviewItem = Readonly<{ displayName: string; disposition: ImportDisposition }>;
export type RegistrationImport = Readonly<{
  players: readonly PlannerPlayer[];
  preview: readonly ImportPreviewItem[];
}>;

export function importRegistrations(
  event: TosEvent,
  draft: PlannerDraft,
  registrations: readonly StaffPlannerInput[],
  createRowId: () => string,
): RegistrationImport {
  if (event.sport !== "padel") throw new InvalidPlannerDraftError();
  const players = [...draft.players];
  const linked = new Map<string, number>();
  const names = new Map<string, PlannerPlayer>();
  const duplicateMembers = new Set<string>();
  players.forEach((item, index) => {
    if (item.memberId) {
      if (linked.has(item.memberId)) duplicateMembers.add(item.memberId);
      else linked.set(item.memberId, index);
    }
    names.set(item.name.toLocaleLowerCase("nl-NL"), item);
  });
  const preview: ImportPreviewItem[] = [];
  for (const registration of registrations) {
    const readiness = derivePlannerReadiness(event, registration);
    if (registration.response === "declined") {
      preview.push({ displayName: registration.displayName, disposition: "declined" });
      continue;
    }
    if (readiness !== PLANNER_READINESS.READY) {
      const disposition: ImportDisposition = readiness === PLANNER_READINESS.APPROVAL_PENDING || readiness === PLANNER_READINESS.APPROVAL_REJECTED
        ? "approval" : readiness === PLANNER_READINESS.MEMBER_INACTIVE ? "member"
          : readiness === PLANNER_READINESS.SPORT_PROFILE_INACTIVE ? "sport-profile"
            : readiness === PLANNER_READINESS.RANKING_MISSING ? "ranking" : "availability";
      preview.push({ displayName: registration.displayName, disposition });
      continue;
    }
    if (duplicateMembers.has(registration.memberId)) {
      preview.push({ displayName: registration.displayName, disposition: "identity-conflict" });
      continue;
    }
    const availableFrom = formatEventClock(registration.availableFrom!);
    const availableUntil = formatEventClock(registration.availableUntil!);
    const index = linked.get(registration.memberId);
    if (index !== undefined) {
      const before = players[index];
      const normalizedName = registration.displayName.toLocaleLowerCase("nl-NL");
      const conflictingName = names.get(normalizedName);
      if (conflictingName && conflictingName.rowId !== before.rowId) {
        preview.push({ displayName: registration.displayName, disposition: "legacy-name-conflict" });
        continue;
      }
      const after: PlannerPlayer = Object.freeze({
        ...before,
        name: registration.displayName,
        ranking: registration.ranking!,
        included: true,
        availableFrom,
        availableUntil,
        memberId: registration.memberId,
        userId: registration.userId,
        registrationId: registration.registrationId,
        registrationUpdatedAt: registration.registrationUpdatedAt,
        sourceEventId: event.id,
      });
      players[index] = after;
      names.delete(before.name.toLocaleLowerCase("nl-NL"));
      names.set(normalizedName, after);
      const changed = JSON.stringify(serializePlayer(before)) !== JSON.stringify(serializePlayer(after));
      preview.push({ displayName: registration.displayName, disposition: changed ? "update" : "unchanged" });
      continue;
    }
    if (names.has(registration.displayName.toLocaleLowerCase("nl-NL"))) {
      preview.push({ displayName: registration.displayName, disposition: "legacy-name-conflict" });
      continue;
    }
    const added: PlannerPlayer = Object.freeze({
      rowId: createRowId(), name: registration.displayName, ranking: registration.ranking!, included: true,
      availableFrom, availableUntil, memberId: registration.memberId, userId: registration.userId,
      registrationId: registration.registrationId, registrationUpdatedAt: registration.registrationUpdatedAt,
      sourceEventId: event.id,
    });
    if (!isUuid(added.rowId)) throw new InvalidPlannerDraftError();
    players.push(added);
    linked.set(registration.memberId, players.length - 1);
    names.set(registration.displayName.toLocaleLowerCase("nl-NL"), added);
    preview.push({ displayName: registration.displayName, disposition: "add" });
  }
  rows(players.map(serializePlayer));
  return Object.freeze({ players, preview });
}
