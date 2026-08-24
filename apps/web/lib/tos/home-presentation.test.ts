import { describe, expect, it } from "vitest";

import type { TosEvent } from "./types";
import { homeHeroPresentation } from "./home-presentation";

const event: TosEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "vrijdag-padel",
  title: "Padel TOS-avond",
  sport: "padel",
  startsAt: "2026-08-28T18:00:00Z",
  endsAt: "2026-08-28T20:00:00Z",
  signupDeadline: "2026-08-28T16:00:00Z",
  status: "open",
  maxParticipants: 24,
};

describe("status-aware homepage presentation", () => {
  it.each([
    ["live-placed", "Jouw TOS-avond. Live.", "/live/vrijdag-padel"],
    ["future-placed", "Je volgende TOS staat klaar.", "/tos/vrijdag-padel"],
    ["future-waitlist", "Je staat op de wachtlijst.", "/tos/vrijdag-padel"],
    ["open", "Zin in een TOS-avond?", "/tos"],
  ] as const)("maps %s to truthful copy and a safe internal action", (kind, title, href) => {
    const presentation = homeHeroPresentation(kind, event);
    expect(presentation.title).toBe(title);
    expect(presentation.action.href).toBe(href);
  });

  it("keeps anonymous and empty states neutral", () => {
    expect(homeHeroPresentation(null, null)).toEqual(expect.objectContaining({
      title: "Samen spelen. Iedere ronde anders.",
      cue: null,
      action: { href: "/tos", label: "Bekijk TOS-avonden" },
    }));
  });

  it("formats the event cue in Dutch and Europe/Amsterdam", () => {
    expect(homeHeroPresentation("future-placed", event).cue).toBe("vrijdag · 20:00");
  });
});
