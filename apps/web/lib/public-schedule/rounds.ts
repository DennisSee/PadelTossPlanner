import { nl } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import type {
  GroupedRound,
  LiveRoundState,
  PersonalRound,
  PublicScheduleRow,
  TimedRound,
} from "./types";

export const CLUB_TIME_ZONE = "Europe/Amsterdam";
export const LIVE_REFRESH_MILLISECONDS = 30_000;
export const LIVE_LEAD_MINUTES = 2;

function roundSortKey(value: string): [number, string] {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric)
    ? [numeric, value]
    : [10_000, value.toLocaleLowerCase("nl-NL")];
}

export function groupScheduleRows(rows: PublicScheduleRow[]): GroupedRound[] {
  const grouped = new Map<string, GroupedRound>();

  for (const row of rows) {
    const key = `${row.Ronde}\u0000${row.Tijd}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      grouped.set(key, {
        roundNumber: row.Ronde,
        roundTime: row.Tijd,
        rows: [row],
      });
    }
  }

  return [...grouped.values()].sort((left, right) => {
    const leftKey = roundSortKey(left.roundNumber);
    const rightKey = roundSortKey(right.roundNumber);
    return leftKey[0] - rightKey[0] || leftKey[1].localeCompare(rightKey[1], "nl-NL");
  });
}

function dateWithOffset(eventDate: string, offset: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate);
  if (!match) {
    return null;
  }
  const value = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + offset),
  );
  return value.toISOString().slice(0, 10);
}

function parseClock(value: string): { hour: number; minute: number }[] {
  return [...value.matchAll(/(\d{1,2}):(\d{2})/g)]
    .map((match) => ({ hour: Number(match[1]), minute: Number(match[2]) }))
    .filter(({ hour, minute }) => hour >= 0 && hour < 24 && minute >= 0 && minute < 60);
}

function zonedDate(eventDate: string, offset: number, hour: number, minute: number): Date | null {
  const date = dateWithOffset(eventDate, offset);
  if (date === null) {
    return null;
  }
  const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  const result = fromZonedTime(`${date}T${clock}`, CLUB_TIME_ZONE);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function buildTimedRounds(
  rows: PublicScheduleRow[],
  eventDate: string,
): TimedRound[] {
  const timed: TimedRound[] = [];
  let previousStart: Date | null = null;

  for (const round of groupScheduleRows(rows)) {
    const clocks = parseClock(round.roundTime);
    if (clocks.length < 2) {
      continue;
    }

    let dayOffset = 0;
    let startsAt = zonedDate(eventDate, dayOffset, clocks[0].hour, clocks[0].minute);
    while (startsAt && previousStart && startsAt <= previousStart && dayOffset < 3) {
      dayOffset += 1;
      startsAt = zonedDate(eventDate, dayOffset, clocks[0].hour, clocks[0].minute);
    }
    if (!startsAt) {
      continue;
    }

    let endOffset = dayOffset;
    let endsAt = zonedDate(eventDate, endOffset, clocks[1].hour, clocks[1].minute);
    if (endsAt && endsAt <= startsAt) {
      endOffset += 1;
      endsAt = zonedDate(eventDate, endOffset, clocks[1].hour, clocks[1].minute);
    }
    if (!endsAt) {
      continue;
    }

    timed.push({ ...round, startsAt, endsAt });
    previousStart = startsAt;
  }

  return timed;
}

function minutesCeil(milliseconds: number): number {
  return Math.max(1, Math.ceil(Math.max(0, milliseconds) / 60_000));
}

export function getLiveRoundState(
  rows: PublicScheduleRow[],
  eventDate: string,
  now: Date,
): LiveRoundState {
  const timed = buildTimedRounds(rows, eventDate);
  if (timed.length === 0) {
    return { kind: "untimed" };
  }

  const first = timed[0];
  const last = timed[timed.length - 1];
  if (now < first.startsAt) {
    return {
      kind: "before",
      next: first,
      startsInMinutes: minutesCeil(first.startsAt.getTime() - now.getTime()),
    };
  }
  if (now >= last.endsAt) {
    return { kind: "after", last };
  }

  const current = timed.find((round) => round.startsAt <= now && now < round.endsAt);
  const next = timed.find((round) => round.startsAt > now) ?? null;
  if (current) {
    const untilNext = next ? next.startsAt.getTime() - now.getTime() : Number.POSITIVE_INFINITY;
    return {
      kind: "current",
      current,
      next,
      remainingMinutes: minutesCeil(current.endsAt.getTime() - now.getTime()),
      nextIsUrgent: untilNext <= LIVE_LEAD_MINUTES * 60_000,
    };
  }
  if (next) {
    const untilNext = next.startsAt.getTime() - now.getTime();
    return {
      kind: "between",
      next,
      startsInMinutes: minutesCeil(untilNext),
      nextIsUrgent: untilNext <= LIVE_LEAD_MINUTES * 60_000,
    };
  }
  return { kind: "after", last };
}

function names(value: string, separator: string): string[] {
  const normalized = value.trim();
  if (!normalized || ["niemand", "none", "nan"].includes(normalized.toLocaleLowerCase("nl-NL"))) {
    return [];
  }
  return normalized.split(separator).map((name) => name.trim()).filter(Boolean);
}

function includesName(values: string[], player: string): boolean {
  const key = player.trim().toLocaleLowerCase("nl-NL");
  return values.some((value) => value.toLocaleLowerCase("nl-NL") === key);
}

export function personalScheduleRows(
  rows: PublicScheduleRow[],
  playerName: string,
): PersonalRound[] {
  return groupScheduleRows(rows).flatMap<PersonalRound>((round) => {
    const playing = round.rows.find(
      (row) =>
        includesName(names(row["Team 1"], " & "), playerName) ||
        includesName(names(row["Team 2"], " & "), playerName),
    );
    if (playing) {
      return [{
        roundNumber: round.roundNumber,
        roundTime: round.roundTime,
        status: "playing" as const,
        court: playing.Baan,
        teamOne: playing["Team 1"],
        teamTwo: playing["Team 2"],
      }];
    }

    const first = round.rows[0];
    const status = includesName(names(first["Nog niet aanwezig"], ","), playerName)
      ? "not-arrived"
      : includesName(names(first["Niet meer beschikbaar"], ","), playerName)
        ? "unavailable"
        : includesName(names(first.Rust, ","), playerName)
          ? "rest"
          : null;
    return status
      ? [{
          roundNumber: round.roundNumber,
          roundTime: round.roundTime,
          status,
          court: "",
          teamOne: "",
          teamTwo: "",
        }]
      : [];
  });
}

export function splitStatusNames(value: string): string[] {
  return names(value, ",");
}

export function sortedParticipants(participants: string[]): string[] {
  return [...new Set(participants)].sort((left, right) =>
    left.localeCompare(right, "nl-NL", { sensitivity: "base" }),
  );
}

export function formatEventDate(eventDate: string): string {
  const value = fromZonedTime(`${eventDate}T12:00:00`, CLUB_TIME_ZONE);
  return formatInTimeZone(value, CLUB_TIME_ZONE, "EEEE d MMMM yyyy", { locale: nl });
}

export function formatCreatedAt(createdAt: string): string {
  return formatInTimeZone(new Date(createdAt), CLUB_TIME_ZONE, "d MMM yyyy, HH:mm", {
    locale: nl,
  });
}
