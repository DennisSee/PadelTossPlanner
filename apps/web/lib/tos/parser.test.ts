import { describe, expect, it } from "vitest";

import {
  InvalidTosDataError,
  parseAttendeeNames,
  parseOffsetTimestamp,
  parseOwnRegistration,
  parseOwnRegistrationWithEvent,
  parseTosEvent,
} from "./parser";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const REGISTRATION_ID = "22222222-2222-4222-8222-222222222222";

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    slug: "vrijdag-padel",
    title: "Vrijdag TOS",
    sport: "padel",
    starts_at: "2026-08-21T18:00:00Z",
    ends_at: "2026-08-21T20:00:00Z",
    signup_deadline: "2026-08-21T16:00:00+00:00",
    status: "open",
    ...overrides,
  };
}

function registration(overrides: Record<string, unknown> = {}) {
  return {
    id: REGISTRATION_ID,
    event_id: EVENT_ID,
    response: "attending",
    available_from: "2026-08-21T18:07:00Z",
    available_until: "2026-08-21T19:43:00Z",
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

describe("TOS PostgREST parsers", () => {
  it("maps the exact public event projection", () => {
    expect(parseTosEvent(event())).toEqual({
      id: EVENT_ID,
      slug: "vrijdag-padel",
      title: "Vrijdag TOS",
      sport: "padel",
      startsAt: "2026-08-21T18:00:00Z",
      endsAt: "2026-08-21T20:00:00Z",
      signupDeadline: "2026-08-21T16:00:00+00:00",
      status: "open",
    });
  });

  it.each([
    event({ sport: "pickleball" }),
    event({ status: "published" }),
    event({ slug: "Unsafe Slug" }),
    event({ starts_at: "2026-08-21T18:00:00" }),
    event({ ends_at: "2026-08-21T17:00:00Z" }),
    event({ id: "not-a-uuid" }),
  ])("fails malformed event data closed", (row) => {
    expect(() => parseTosEvent(row)).toThrow(InvalidTosDataError);
  });

  it("accepts one attending or declined own registration", () => {
    expect(parseOwnRegistration(registration()).response).toBe("attending");
    expect(parseOwnRegistration(registration({
      response: "declined",
      available_from: null,
      available_until: null,
    }))).toMatchObject({ response: "declined", availableFrom: null, availableUntil: null });
  });

  it.each([
    registration({ response: "maybe" }),
    registration({ response: "declined" }),
    registration({ available_until: "2026-08-21T18:00:00Z" }),
    registration({ created_at: "2026-08-20 10:00" }),
  ])("fails inconsistent own registration data closed", (row) => {
    expect(() => parseOwnRegistration(row)).toThrow(InvalidTosDataError);
  });

  it("parses the nested own-event projection and verifies the relation", () => {
    expect(parseOwnRegistrationWithEvent({
      ...registration(),
      tos_events: event(),
    }).event.slug).toBe("vrijdag-padel");
    expect(() => parseOwnRegistrationWithEvent({
      ...registration(),
      tos_events: event({ id: "33333333-3333-4333-8333-333333333333" }),
    })).toThrow(InvalidTosDataError);
  });

  it("accepts offset-aware timestamps only", () => {
    expect(parseOffsetTimestamp("2026-08-20T12:00:00+02:00")).toContain("+02:00");
    expect(() => parseOffsetTimestamp("2026-08-20T12:00:00")).toThrow(InvalidTosDataError);
  });

  it("returns only one safe attendee-name field per row", () => {
    expect(parseAttendeeNames([
      { display_name: " Dennis " },
      { display_name: "<img src=x onerror=alert(1)>" },
    ])).toEqual(["Dennis", "<img src=x onerror=alert(1)>"]);
    expect(() => parseAttendeeNames([{ display_name: "Dennis", email: "private@example.test" }]))
      .toThrow(InvalidTosDataError);
  });
});
