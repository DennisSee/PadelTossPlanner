import { describe, expect, it } from "vitest";

import {
  filterParticipantEvents,
  filterStaffEvents,
  participantFilters,
  staffFilters,
} from "./event-filters";
import type { TosEvent } from "./types";

const now = new Date("2026-08-21T12:00:00Z");

function event(
  id: string,
  status: TosEvent["status"],
  sport: TosEvent["sport"] = "padel",
  startsAt = "2026-08-28T18:00:00Z",
  signupDeadline: string | null = "2026-08-28T17:00:00Z",
): TosEvent {
  return {
    id,
    slug: `web6-${id.slice(-4)}`,
    title: id,
    sport,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 7_200_000).toISOString(),
    signupDeadline,
    status,
    maxParticipants: 24,
  };
}

describe("TOS event filters", () => {
  const openPadel = event("11111111-1111-4111-8111-111111111111", "open");
  const openTennis = event("22222222-2222-4222-8222-222222222222", "open", "tennis");
  const closed = event("33333333-3333-4333-8333-333333333333", "closed");
  const expiredDeadline = event(
    "44444444-4444-4444-8444-444444444444",
    "open",
    "padel",
    "2026-08-28T18:00:00Z",
    "2026-08-20T17:00:00Z",
  );
  const past = event(
    "55555555-5555-4555-8555-555555555555",
    "closed",
    "tennis",
    "2026-08-20T18:00:00Z",
  );
  const draft = event("66666666-6666-4666-8666-666666666666", "draft");
  const cancelled = event("77777777-7777-4777-8777-777777777777", "cancelled");
  const events = [openPadel, openTennis, closed, expiredDeadline, past, draft, cancelled];

  it("defaults participants to open/all and fails unknown params closed", () => {
    expect(participantFilters({})).toEqual({ status: "open", sport: "all" });
    expect(participantFilters({ status: "unsafe", sport: "squash" }))
      .toEqual({ status: "open", sport: "all" });
    expect(participantFilters({ status: ["all", "closed"], sport: ["padel", "tennis"] }))
      .toEqual({ status: "closed", sport: "tennis" });
  });

  it("maps participant Open to actual self-service and Gesloten to non-open", () => {
    expect(filterParticipantEvents(events, { status: "open", sport: "all" }, now))
      .toEqual([openPadel, openTennis]);
    expect(filterParticipantEvents(events, { status: "closed", sport: "all" }, now))
      .toEqual([closed, expiredDeadline, past, draft, cancelled]);
    expect(filterParticipantEvents(events, { status: "all", sport: "tennis" }, now))
      .toEqual([openTennis, past]);
  });

  it("uses current as the conservative staff default", () => {
    expect(staffFilters({})).toEqual({ status: "current", sport: "all" });
    expect(filterStaffEvents(events, { status: "current", sport: "all" }, now))
      .toEqual([openPadel, openTennis, closed, expiredDeadline, draft]);
  });

  it("supports every explicit staff status without changing source data", () => {
    expect(filterStaffEvents(events, { status: "open", sport: "all" }, now))
      .toEqual([openPadel, openTennis]);
    expect(filterStaffEvents(events, { status: "closed", sport: "all" }, now))
      .toEqual([closed, expiredDeadline]);
    expect(filterStaffEvents(events, { status: "past", sport: "all" }, now)).toEqual([past]);
    expect(filterStaffEvents(events, { status: "draft", sport: "all" }, now)).toEqual([draft]);
    expect(filterStaffEvents(events, { status: "cancelled", sport: "all" }, now)).toEqual([cancelled]);
    expect(events).toHaveLength(7);
  });
});
