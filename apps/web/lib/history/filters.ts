import { formatInTimeZone } from "date-fns-tz";

import type { HistoryClubmate, HistoryEvent, HistorySport } from "./types";

const TIME_ZONE = "Europe/Amsterdam";

export type HistoryFilters = Readonly<{ year: number | null; sport: HistorySport | null; query: string }>;
export type HistorySummary = Readonly<{
  evenings: number;
  matches: number;
  clubmates: number;
  mostPlayed: Readonly<{ displayName: string; matches: number }> | null;
}>;

function safeQuery(value: string | string[] | undefined): string {
  const input = (Array.isArray(value) ? value.at(-1) : value)?.trim() ?? "";
  return input.length <= 80 && !/[\u0000-\u001f\u007f]/u.test(input) ? input : "";
}

export function eventYear(event: HistoryEvent): number {
  return Number(formatInTimeZone(new Date(event.startsAt), TIME_ZONE, "yyyy"));
}

export function availableHistoryYears(events: readonly HistoryEvent[]): number[] {
  return [...new Set(events.map(eventYear))].sort((left, right) => right - left);
}

export function historyFilters(
  params: Readonly<{ year?: string | string[]; sport?: string | string[]; q?: string | string[] }>,
  events: readonly HistoryEvent[],
  currentYear = Number(formatInTimeZone(new Date(), TIME_ZONE, "yyyy")),
): HistoryFilters {
  const years = availableHistoryYears(events);
  const yearValue = safeQuery(params.year);
  const parsedYear = /^\d{4}$/u.test(yearValue) ? Number(yearValue) : null;
  const defaultYear = years.includes(currentYear) ? currentYear : (years[0] ?? null);
  const sportValue = safeQuery(params.sport);
  return Object.freeze({
    year: yearValue === "all" ? null : parsedYear !== null && years.includes(parsedYear) ? parsedYear : defaultYear,
    sport: sportValue === "padel" || sportValue === "tennis" ? sportValue : null,
    query: safeQuery(params.q),
  });
}

export function baseFilteredHistory(events: readonly HistoryEvent[], filters: HistoryFilters): HistoryEvent[] {
  return events.filter((event) =>
    (filters.year === null || eventYear(event) === filters.year) &&
    (filters.sport === null || event.sport === filters.sport));
}

function eventMemberIds(event: HistoryEvent): Set<string> {
  return new Set(event.rounds.flatMap((round) => [...round.partners, ...round.opponents])
    .flatMap((person) => person.memberId ? [person.memberId] : []));
}

export function visibleHistory(
  events: readonly HistoryEvent[],
  clubmates: readonly HistoryClubmate[],
  filters: HistoryFilters,
): HistoryEvent[] {
  const base = baseFilteredHistory(events, filters);
  if (!filters.query) return base;
  const needle = filters.query.toLocaleLowerCase("nl-NL");
  const matching = new Set(clubmates
    .filter((clubmate) => clubmate.displayName.toLocaleLowerCase("nl-NL").includes(needle))
    .map((clubmate) => clubmate.memberId));
  return base.filter((event) => [...eventMemberIds(event)].some((memberId) => matching.has(memberId)));
}

export function historySummary(
  events: readonly HistoryEvent[],
  clubmates: readonly HistoryClubmate[],
  filters: HistoryFilters,
): HistorySummary {
  const base = baseFilteredHistory(events, filters);
  const counts = new Map<string, number>();
  const names = new Map(clubmates.map((clubmate) => [clubmate.memberId, clubmate.displayName]));
  for (const event of base) for (const round of event.rounds) {
    if (round.state !== "playing") continue;
    for (const person of [...round.partners, ...round.opponents]) if (person.memberId) {
      counts.set(person.memberId, (counts.get(person.memberId) ?? 0) + 1);
    }
  }
  const sorted = [...counts.entries()].sort((left, right) =>
    right[1] - left[1] || (names.get(left[0]) ?? "").localeCompare(names.get(right[0]) ?? "", "nl-NL") || left[0].localeCompare(right[0]));
  return Object.freeze({
    evenings: base.length,
    matches: base.reduce((total, event) => total + event.matchCount, 0),
    clubmates: counts.size,
    mostPlayed: sorted[0] ? Object.freeze({ displayName: names.get(sorted[0][0]) ?? "Clubgenoot", matches: sorted[0][1] }) : null,
  });
}
