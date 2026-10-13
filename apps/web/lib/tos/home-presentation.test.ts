import { describe, expect, it } from "vitest";

import type { TosEvent } from "./types";
import { homePresentation } from "./home-presentation";

const event: TosEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "vrijdag-padel",
  title: "Padel TOS",
  sport: "padel",
  startsAt: "2026-08-28T18:00:00Z",
  endsAt: "2026-08-28T20:00:00Z",
  signupDeadline: "2026-08-28T16:00:00Z",
  status: "open",
  maxParticipants: 24,
};
const editOpen = new Date("2026-08-28T15:00:00Z");
const editClosed = new Date("2026-08-28T17:00:00Z");

function presentation(
  kind: "live-placed" | "future-placed" | "future-waitlist" | "open" | null,
  options: Partial<{ now: Date; hasPublishedSchedule: boolean; hasRegistration: boolean }> = {},
  selectedEvent: TosEvent | null = event,
) {
  return homePresentation(kind, selectedEvent, {
    now: options.now ?? editOpen,
    hasPublishedSchedule: options.hasPublishedSchedule ?? false,
    hasRegistration: options.hasRegistration ?? true,
  });
}

describe("truthful status-aware homepage presentation", () => {
  it("keeps an editable placed registration on its participant route", () => {
    const value = presentation("future-placed");
    expect(value.action).toMatchObject({ href: "/tos/vrijdag-padel", label: "Mijn aanmelding" });
    expect(value.cardAction).toMatchObject({ href: "/tos/vrijdag-padel", label: "Mijn aanmelding" });
  });

  it("uses event status after close when no published schedule exists", () => {
    const value = presentation("future-placed", { now: editClosed });
    expect(value.action).toMatchObject({ href: "/tos/vrijdag-padel", label: "Mijn aanmelding", status: "Schema volgt" });
    expect(value.cardAction).toEqual(value.action);
    expect(JSON.stringify(value)).not.toContain("Aanmelding wijzigen");
    expect(JSON.stringify(value)).not.toContain("Bekijk je schema");
  });

  it("links a closed placed registration only to a published schedule", () => {
    const value = presentation("future-placed", { now: editClosed, hasPublishedSchedule: true });
    expect(value.action).toEqual({ href: "/live/vrijdag-padel", label: "Bekijk je schema" });
    expect(value.cardAction).toEqual(value.action);
  });

  it("gives a current published schedule live priority", () => {
    const value = presentation("live-placed", { now: editClosed, hasPublishedSchedule: true });
    expect(value.title).toBe("Jouw TOS. Live.");
    expect(value.action).toEqual({ href: "/live/vrijdag-padel", label: "Bekijk live TOS-schema" });
    expect(value.cardAction).toEqual({ href: "/live/vrijdag-padel", label: "Bekijk live schema" });
  });

  it("keeps waitlist states on the status route before and after close", () => {
    for (const now of [editOpen, editClosed]) {
      const value = presentation("future-waitlist", { now });
      expect(value.action).toEqual({ href: "/tos/vrijdag-padel", label: "Mijn wachtlijstpositie" });
      expect(value.cardAction).toEqual(value.action);
    }
  });

  it("never links a cancelled event to live", () => {
    const value = presentation(
      "future-placed",
      { now: editClosed, hasPublishedSchedule: true },
      { ...event, status: "cancelled" },
    );
    expect(value.action.href).toBe("/tos/vrijdag-padel");
    expect(value.title).toMatch(/geannuleerd/u);
  });

  it("keeps anonymous and open states neutral and formats Amsterdam time", () => {
    expect(presentation(null, {}, null)).toMatchObject({
      title: "ZIN IN EEN TOS?",
      cue: null,
      action: { href: "/tos", label: "BEKIJK TOS-MOMENTEN" },
    });
    expect(presentation("open", { hasRegistration: false }).cardAction.label).toBe("Aanmelden");
    expect(presentation("future-placed").cue).toBe("vrijdag · 20:00");
  });
});
