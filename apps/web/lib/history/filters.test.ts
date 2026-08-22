import { describe, expect, it } from "vitest";
import { historyFilters, historySummary, visibleHistory } from "./filters";
import type { HistoryClubmate, HistoryEvent } from "./types";

const events: HistoryEvent[] = [{ eventId: "11111111-1111-4111-8111-111111111111", title: "TOS", sport: "padel", startsAt: "2026-08-21T18:00:00Z", endsAt: "2026-08-21T20:00:00Z", matchCount: 1, restCount: 0, rounds: [{ roundNumber: 1, startsAt: "2026-08-21T18:00:00Z", endsAt: "2026-08-21T18:20:00Z", state: "playing", courtName: "Kremer", partners: [{ memberId: "22222222-2222-4222-8222-222222222222", displayName: "Anna" }], opponents: [] }] }];
const clubmates: HistoryClubmate[] = [{ memberId: "22222222-2222-4222-8222-222222222222", displayName: "Anna", sharedMatches: 1, sharedEvents: 1, lastSharedAt: "2026-08-21T20:00:00Z" }];

describe("history filters", () => {
  it("defaults to the newest available year and scopes name search to returned clubmates", () => {
    const filters = historyFilters({ q: "ann" }, events, 2027);
    expect(filters.year).toBe(2026);
    expect(visibleHistory(events, clubmates, filters)).toHaveLength(1);
    expect(visibleHistory(events, clubmates, { ...filters, query: "unknown" })).toHaveLength(0);
  });

  it("derives summary values without a persisted statistics table", () => {
    expect(historySummary(events, clubmates, { year: 2026, sport: null, query: "" })).toEqual({ evenings: 1, matches: 1, clubmates: 1, mostPlayed: { displayName: "Anna", matches: 1 } });
  });
});
