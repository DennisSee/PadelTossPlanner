import { describe, expect, it } from "vitest";

import { attendeeNamesPreview, eventsWithoutOwnRegistration, sortEvents } from "./dashboard";
import type { OwnRegistrationWithEvent, TosEvent } from "./types";

function event(id: string, startsAt: string): TosEvent {
  return {
    id,
    slug: `event-${id.slice(0, 3)}`,
    title: id,
    sport: "padel",
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 7_200_000).toISOString(),
    signupDeadline: null,
    status: "open",
  };
}

function registration(eventValue: TosEvent, response: "attending" | "declined"): OwnRegistrationWithEvent {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    eventId: eventValue.id,
    response,
    availableFrom: response === "attending" ? eventValue.startsAt : null,
    availableUntil: response === "attending" ? eventValue.endsAt : null,
    createdAt: "2026-08-20T10:00:00Z",
    updatedAt: "2026-08-20T10:00:00Z",
    event: eventValue,
  };
}

describe("TOS dashboard selection", () => {
  const first = event("11111111-1111-4111-8111-111111111111", "2026-08-21T18:00:00Z");
  const second = event("22222222-2222-4222-8222-222222222222", "2026-08-28T18:00:00Z");
  const third = event("33333333-3333-4333-8333-333333333333", "2026-09-04T18:00:00Z");

  it("sorts open events chronologically without mutating input", () => {
    const input = [third, first, second];
    expect(sortEvents(input).map((item) => item.id)).toEqual([first.id, second.id, third.id]);
    expect(input[0]).toBe(third);
  });

  it("excludes both attending and declined own rows from Nog aanmelden", () => {
    expect(eventsWithoutOwnRegistration(
      [third, first, second],
      [registration(first, "attending"), registration(second, "declined")],
    ).map((item) => item.id)).toEqual([third.id]);
  });

  it("builds a compact four-name preview", () => {
    expect(attendeeNamesPreview(["A", "B", "C", "D", "E", "F"]))
      .toBe("A · B · C · D · +2");
  });
});
