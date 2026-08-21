import { describe, expect, it } from "vitest";

import {
  createEventDefaults,
  generateStaffEventSlug,
  InvalidStaffEventRequestError,
  validateCreateEvent,
  validateUpdateEvent,
} from "./staff-management";
import type { TosEvent } from "./types";

const base = {
  title: "  TOS vrijdag  ",
  sport: "padel",
  eventDate: "2026-08-28",
  startsAt: "20:07",
  endsAt: "22:00",
  signupDeadline: "2026-08-28T19:00",
  status: "draft",
  maxParticipants: "24",
};

describe("staff event management validation", () => {
  it("normalizes the exact create contract and accepts minute precision", () => {
    expect(validateCreateEvent(base, "a1b2c3d4")).toEqual({
      slug: "padel-tos-20260828-a1b2c3d4",
      title: "TOS vrijdag",
      sport: "padel",
      startsAt: "2026-08-28T18:07:00.000Z",
      endsAt: "2026-08-28T20:00:00.000Z",
      signupDeadline: "2026-08-28T17:00:00.000Z",
      status: "draft",
      maxParticipants: 24,
    });
  });

  it("supports both sports, all statuses and nullable deadlines", () => {
    for (const status of ["draft", "open", "closed", "cancelled"]) {
      const result = validateCreateEvent({ ...base, sport: "tennis", status, signupDeadline: "" }, "1234abcd");
      expect(result.sport).toBe("tennis");
      expect(result.status).toBe(status);
      expect(result.signupDeadline).toBeNull();
    }
  });

  it.each([
    { title: " ", label: "empty title" },
    { title: "x".repeat(161), label: "long title" },
    { title: "bad\nname", label: "control character" },
    { sport: "squash", label: "sport" },
    { status: "archived", label: "status" },
    { eventDate: "2026-02-30", label: "calendar date" },
    { eventDate: "28-08-2026", label: "date shape" },
    { startsAt: "7:00", label: "clock shape" },
    { startsAt: "24:00", label: "clock range" },
    { startsAt: "22:00", endsAt: "20:00", label: "reverse range" },
    { startsAt: "22:00", endsAt: "00:30", label: "midnight range" },
    { signupDeadline: "2026-08-28T20:08", label: "late deadline" },
    { maxParticipants: "0", label: "zero capacity" },
    { maxParticipants: "501", label: "excessive capacity" },
  ])("rejects $label", (change) => {
    const values = Object.fromEntries(
      Object.entries(change).filter(([key]) => key !== "label"),
    );
    expect(() => validateCreateEvent({ ...base, ...values }, "a1b2c3d4"))
      .toThrow(InvalidStaffEventRequestError);
  });

  it("uses the correct winter and summer offsets", () => {
    const winter = validateCreateEvent({ ...base, eventDate: "2026-01-16", signupDeadline: "" }, "a1b2c3d4");
    const summer = validateCreateEvent({ ...base, eventDate: "2026-07-17", signupDeadline: "" }, "a1b2c3d4");
    expect(winter.startsAt).toBe("2026-01-16T19:07:00.000Z");
    expect(summer.startsAt).toBe("2026-07-17T18:07:00.000Z");
  });

  it.each([
    ["2026-03-29", "02:30"],
    ["2026-10-25", "02:30"],
  ])("fails closed for DST boundary %s %s", (eventDate, startsAt) => {
    expect(() => validateCreateEvent({ ...base, eventDate, startsAt, signupDeadline: "" }, "a1b2c3d4"))
      .toThrow(InvalidStaffEventRequestError);
  });

  it("builds validated deterministic slugs without title data", () => {
    expect(generateStaffEventSlug("padel", "2026-08-28", "deadbeef"))
      .toBe("padel-tos-20260828-deadbeef");
    expect(() => generateStaffEventSlug("padel", "2026-08-28", "attacker"))
      .toThrow(InvalidStaffEventRequestError);
  });

  it("validates only mutable update fields against the server-read start", () => {
    const event: TosEvent = {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "padel-tos-20260828-a1b2c3d4",
      title: "Old",
      sport: "padel",
      startsAt: "2026-08-28T18:00:00Z",
      endsAt: "2026-08-28T20:00:00Z",
      signupDeadline: null,
      status: "draft",
      maxParticipants: 24,
    };
    expect(validateUpdateEvent({ title: " New ", signupDeadline: "", status: "open", maxParticipants: "32" }, event))
      .toEqual({ title: "New", signupDeadline: null, status: "open", maxParticipants: 32 });
    expect(() => validateUpdateEvent({ title: "New", signupDeadline: "2026-08-28T20:01", status: "open", maxParticipants: "24" }, event))
      .toThrow(InvalidStaffEventRequestError);
  });

  it("derives defaults from the Amsterdam club date", () => {
    expect(createEventDefaults(new Date("2026-08-20T22:30:00Z"))).toMatchObject({
      eventDate: "2026-08-28",
      signupDeadline: "2026-08-28T19:00",
      startsAt: "20:00",
      endsAt: "22:00",
      status: "draft",
      maxParticipants: 24,
    });
  });
});
