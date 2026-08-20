import { describe, expect, it } from "vitest";

import {
  eventAllowsSelfService,
  eventPresentationStatus,
  fullEventAvailability,
  InvalidAvailabilityError,
  normalizeAvailability,
  TIME_INPUT_STEP_SECONDS,
} from "./time";
import type { TosEvent } from "./types";

const BASE_EVENT: TosEvent = Object.freeze({
  id: "11111111-1111-4111-8111-111111111111",
  slug: "vrijdag-padel",
  title: "Vrijdag TOS",
  sport: "padel",
  startsAt: "2026-08-21T18:00:00Z",
  endsAt: "2026-08-21T20:00:00Z",
  signupDeadline: "2026-08-21T17:00:00Z",
  status: "open",
});

describe("Europe/Amsterdam registration time handling", () => {
  it("allows every minute in the UI and accepts non-five-minute availability", () => {
    expect(TIME_INPUT_STEP_SECONDS).toBe(60);
    expect(fullEventAvailability(BASE_EVENT)).toEqual({ from: "20:00", until: "22:00" });
    expect(normalizeAvailability(BASE_EVENT, "attending", "20:07", "21:43")).toEqual({
      response: "attending",
      availableFrom: "2026-08-21T18:07:00.000Z",
      availableUntil: "2026-08-21T19:43:00.000Z",
    });
  });

  it("normalizes declined availability to null", () => {
    expect(normalizeAvailability(BASE_EVENT, "declined", "nonsense", "nonsense"))
      .toEqual({ response: "declined", availableFrom: null, availableUntil: null });
  });

  it("handles events over local midnight", () => {
    const event = { ...BASE_EVENT, startsAt: "2026-08-21T21:00:00Z", endsAt: "2026-08-21T23:00:00Z" };
    expect(normalizeAvailability(event, "attending", "23:30", "00:45")).toEqual({
      response: "attending",
      availableFrom: "2026-08-21T21:30:00.000Z",
      availableUntil: "2026-08-21T22:45:00.000Z",
    });
  });

  it("uses winter and summer UTC offsets correctly", () => {
    const winter = { ...BASE_EVENT, startsAt: "2026-01-16T19:00:00Z", endsAt: "2026-01-16T21:00:00Z" };
    expect(normalizeAvailability(winter, "attending", "20:00", "22:00").availableFrom)
      .toBe("2026-01-16T19:00:00.000Z");
    expect(normalizeAvailability(BASE_EVENT, "attending", "20:00", "22:00").availableFrom)
      .toBe("2026-08-21T18:00:00.000Z");
  });

  it.each([
    ["19:59", "22:00"],
    ["20:00", "22:01"],
    ["21:00", "21:00"],
    ["24:00", "22:00"],
  ])("rejects invalid or out-of-window availability %s–%s", (from, until) => {
    expect(() => normalizeAvailability(BASE_EVENT, "attending", from, until))
      .toThrow(InvalidAvailabilityError);
  });

  it("fails ambiguous and missing DST clock times closed", () => {
    const spring = { ...BASE_EVENT, startsAt: "2026-03-29T00:00:00Z", endsAt: "2026-03-29T03:00:00Z" };
    const autumn = { ...BASE_EVENT, startsAt: "2026-10-25T00:00:00Z", endsAt: "2026-10-25T03:00:00Z" };
    expect(() => normalizeAvailability(spring, "attending", "02:30", "04:00"))
      .toThrow(InvalidAvailabilityError);
    expect(() => normalizeAvailability(autumn, "attending", "02:30", "04:00"))
      .toThrow(InvalidAvailabilityError);
  });

  it("enforces status/deadline but deliberately not event end as a write bound", () => {
    expect(eventAllowsSelfService(BASE_EVENT, new Date("2026-08-21T16:59:59Z"))).toBe(true);
    expect(eventAllowsSelfService(BASE_EVENT, new Date("2026-08-21T17:00:01Z"))).toBe(false);
    expect(eventAllowsSelfService({ ...BASE_EVENT, signupDeadline: null }, new Date("2026-08-22T00:00:00Z"))).toBe(true);
    expect(eventAllowsSelfService({ ...BASE_EVENT, status: "closed" })).toBe(false);
    expect(eventPresentationStatus({ ...BASE_EVENT, status: "cancelled" })).toBe("Geannuleerd");
  });
});
