import "server-only";

import type { PlannerGeneration, PrivateScheduleRow } from "../planner-api/types";
import type { PlannerDraft, PlannerPlayer } from "./types";

const NONE = new Set(["niemand", "none", "nan"]);

export type ScheduleHistoryPlayerRef = Readonly<{
  row_id: string;
  name: string;
}>;

export type ScheduleHistoryIdentityRow = Readonly<{
  Ronde: number;
  Tijd: string;
  Baan: string;
  "Team 1": readonly ScheduleHistoryPlayerRef[];
  "Team 2": readonly ScheduleHistoryPlayerRef[];
  Rust: readonly ScheduleHistoryPlayerRef[];
  "Nog niet aanwezig": readonly ScheduleHistoryPlayerRef[];
  "Niet meer beschikbaar": readonly ScheduleHistoryPlayerRef[];
}>;

export class ScheduleHistoryIdentityError extends Error {
  constructor() {
    super("De speleridentiteit in het schema is niet eenduidig.");
    this.name = "ScheduleHistoryIdentityError";
  }
}

function key(value: string): string {
  return value.trim().toLocaleLowerCase("nl-NL");
}

function uniqueIncludedPlayers(draft: PlannerDraft): readonly PlannerPlayer[] {
  const included = draft.players.filter((player) => player.included);
  const names = new Set<string>();
  for (const player of included) {
    const playerKey = key(player.name);
    if (!playerKey || names.has(playerKey)) throw new ScheduleHistoryIdentityError();
    names.add(playerKey);
  }
  return included;
}

function parseJoinedPlayers(
  value: string,
  separator: " & " | ", ",
  players: readonly PlannerPlayer[],
): ScheduleHistoryPlayerRef[] {
  const normalized = value.trim();
  if (!normalized || NONE.has(key(normalized))) return [];

  const candidates = players.map((player) => Object.freeze({
    player,
    normalized: player.name.trim(),
  }));
  const solutions: PlannerPlayer[][] = [];

  function visit(offset: number, selected: PlannerPlayer[]): void {
    if (solutions.length > 1) return;
    if (offset === normalized.length) {
      solutions.push(selected);
      return;
    }
    for (const candidate of candidates) {
      const part = normalized.slice(offset, offset + candidate.normalized.length);
      if (key(part) !== key(candidate.normalized)) continue;
      const next = offset + candidate.normalized.length;
      if (next === normalized.length) visit(next, [...selected, candidate.player]);
      else if (normalized.slice(next, next + separator.length) === separator) {
        visit(next + separator.length, [...selected, candidate.player]);
      }
    }
  }

  visit(0, []);
  if (solutions.length !== 1) throw new ScheduleHistoryIdentityError();
  const seen = new Set<string>();
  return solutions[0].map((player) => {
    if (seen.has(player.rowId)) throw new ScheduleHistoryIdentityError();
    seen.add(player.rowId);
    return Object.freeze({ row_id: player.rowId, name: player.name });
  });
}

function identityRow(
  row: PrivateScheduleRow,
  players: readonly PlannerPlayer[],
): ScheduleHistoryIdentityRow {
  return Object.freeze({
    Ronde: row.Ronde,
    Tijd: row.Tijd,
    Baan: row.Baan,
    "Team 1": parseJoinedPlayers(row["Team 1"], " & ", players),
    "Team 2": parseJoinedPlayers(row["Team 2"], " & ", players),
    Rust: parseJoinedPlayers(row.Rust, ", ", players),
    "Nog niet aanwezig": parseJoinedPlayers(row["Nog niet aanwezig"], ", ", players),
    "Niet meer beschikbaar": parseJoinedPlayers(row["Niet meer beschikbaar"], ", ", players),
  });
}

export function buildScheduleHistoryIdentity(
  draft: PlannerDraft,
  generation: PlannerGeneration,
): readonly ScheduleHistoryIdentityRow[] {
  const players = uniqueIncludedPlayers(draft);
  if (!generation.schedule.length) throw new ScheduleHistoryIdentityError();
  return generation.schedule.map((row) => identityRow(row, players));
}
