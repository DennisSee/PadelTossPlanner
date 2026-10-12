import { describe, expect, it } from "vitest";

import { homeOverviewEvents, selectHomeEvent } from "./home-event";
import type { OwnRegistrationPosition, OwnRegistrationWithEvent, TosEvent } from "./types";

function event(id: string, startsAt: string, status: TosEvent["status"] = "open"): TosEvent {
  return { id, slug: `event-${id.at(-1)}`, title: `Event ${id.at(-1)}`, sport: "padel", startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 7_200_000).toISOString(), signupDeadline: null,
    status, maxParticipants: 4 };
}

function registration(value: TosEvent): OwnRegistrationWithEvent {
  return { id: `registration-${value.id}`, eventId: value.id, response: "attending",
    availableFrom: value.startsAt, availableUntil: value.endsAt, attendingSince: "2026-08-20T10:00:00Z",
    createdAt: "2026-08-20T10:00:00Z", updatedAt: "2026-08-20T10:00:00Z", event: value };
}

const placed: OwnRegistrationPosition = { placementStatus: "placed", waitlistPosition: null };
const waitlist: OwnRegistrationPosition = { placementStatus: "waitlist", waitlistPosition: 1 };

describe("personalized home event selection", () => {
  const now = new Date("2026-08-23T12:00:00Z");
  const live = event("1", "2026-08-23T11:00:00Z");
  const futurePlaced = event("2", "2026-08-25T18:00:00Z");
  const futureWaiting = event("3", "2026-08-24T18:00:00Z");
  const open = event("4", "2026-08-24T17:00:00Z");

  it("prioritizes live placed, then future placed and then waitlist", () => {
    const registrations = [registration(futureWaiting), registration(futurePlaced), registration(live)];
    const positions = new Map([[live.id, placed], [futurePlaced.id, placed], [futureWaiting.id, waitlist]]);
    expect(selectHomeEvent([open], registrations, positions, now)?.kind).toBe("live-placed");
    expect(selectHomeEvent([open], registrations.slice(0, 2), positions, now)?.event.id).toBe(futurePlaced.id);
    expect(selectHomeEvent([open], registrations.slice(0, 1), positions, now)?.kind).toBe("future-waitlist");
  });

  it("uses a deterministic open fallback and excludes cancelled events", () => {
    const earlier = { ...open, id: "0", slug: "a-first" };
    expect(selectHomeEvent([open, earlier], [], new Map(), now)?.event.id).toBe("0");
    expect(selectHomeEvent([{ ...earlier, status: "cancelled" }], [], new Map(), now)).toBeNull();
  });

  it("shows every open moment chronologically, including multiple on one day", () => {
    const morning = event("5", "2026-08-24T08:00:00Z");
    const evening = event("6", "2026-08-24T18:00:00Z");
    const tie = { ...evening, id: "7", slug: "a-first" };
    expect(homeOverviewEvents([evening, morning, tie, open], null, now).map((value) => value.id))
      .toEqual(["5", "4", "7", "6"]);
  });

  it("excludes ended, cancelled, draft, closed and deadline-expired moments", () => {
    const expired = { ...open, signupDeadline: "2026-08-23T11:59:00Z" };
    const ended = event("8", "2026-08-22T18:00:00Z");
    const excluded = [expired, ended, ...(["closed", "draft", "cancelled"] as const)
      .map((status) => ({ ...open, status }))];
    expect(homeOverviewEvents(excluded, null, now)).toEqual([]);
    expect(selectHomeEvent([expired], [], new Map(), now)).toBeNull();
  });

  it("keeps the closed placed moment and never duplicates a personal open card", () => {
    const closed = { ...futurePlaced, status: "closed" as const };
    const selected = selectHomeEvent([open], [registration(closed)], new Map([[closed.id, placed]]), now);
    expect(homeOverviewEvents([open], selected, now).map((value) => value.id)).toEqual(["4", "2"]);
    const personalOpen = selectHomeEvent([futurePlaced], [registration(futurePlaced)], new Map([[futurePlaced.id, placed]]), now);
    expect(homeOverviewEvents([futurePlaced, futurePlaced], personalOpen, now)).toEqual([futurePlaced]);
  });
});
