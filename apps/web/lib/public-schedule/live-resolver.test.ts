import { describe, expect, it } from "vitest";

import { resolveLiveCandidates } from "./live-resolver";
import type { PublicLiveCandidate } from "./types";

function event(slug: string, startsAt: string, endsAt: string): PublicLiveCandidate {
  return { slug, title: slug, sport: slug.includes("tennis") ? "tennis" : "padel", startsAt, endsAt };
}

describe("eventgebonden live resolver", () => {
  const now = new Date("2026-08-23T18:30:00Z");

  it("kiest de enige lopende publicatie boven toekomst en verleden", () => {
    expect(resolveLiveCandidates([
      event("past", "2026-08-22T18:00:00Z", "2026-08-22T20:00:00Z"),
      event("current", "2026-08-23T18:00:00Z", "2026-08-23T20:00:00Z"),
      event("future", "2026-08-24T18:00:00Z", "2026-08-24T20:00:00Z"),
    ], now)).toEqual({ kind: "redirect", slug: "current" });
  });

  it("toont keuze bij echte gelijktijdige ambiguïteit", () => {
    const result = resolveLiveCandidates([
      event("padel", "2026-08-23T18:00:00Z", "2026-08-23T20:00:00Z"),
      event("tennis", "2026-08-23T18:15:00Z", "2026-08-23T19:45:00Z"),
    ], now);
    expect(result.kind).toBe("selection");
    if (result.kind === "selection") expect(result.candidates.map(({ slug }) => slug)).toEqual(["padel", "tennis"]);
  });

  it("kiest anders eerstvolgende en daarna meest recente afgelopen event", () => {
    expect(resolveLiveCandidates([
      event("later", "2026-08-25T18:00:00Z", "2026-08-25T20:00:00Z"),
      event("next", "2026-08-24T18:00:00Z", "2026-08-24T20:00:00Z"),
    ], now)).toEqual({ kind: "redirect", slug: "next" });
    expect(resolveLiveCandidates([
      event("older", "2026-08-21T18:00:00Z", "2026-08-21T20:00:00Z"),
      event("latest", "2026-08-22T18:00:00Z", "2026-08-22T20:00:00Z"),
    ], now)).toEqual({ kind: "redirect", slug: "latest" });
  });

  it("toont een deterministische keuze bij gelijke toekomstige start of afgelopen eindtijd", () => {
    const future = resolveLiveCandidates([
      event("tennis-next", "2026-08-24T18:00:00Z", "2026-08-24T20:00:00Z"),
      event("padel-next", "2026-08-24T18:00:00Z", "2026-08-24T19:30:00Z"),
    ], now);
    expect(future.kind).toBe("selection");
    if (future.kind === "selection") expect(future.candidates.map(({ slug }) => slug)).toEqual(["padel-next", "tennis-next"]);

    const past = resolveLiveCandidates([
      event("tennis-past", "2026-08-22T18:30:00Z", "2026-08-22T20:00:00Z"),
      event("padel-past", "2026-08-22T18:00:00Z", "2026-08-22T20:00:00Z"),
    ], now);
    expect(past.kind).toBe("selection");
    if (past.kind === "selection") expect(past.candidates.map(({ slug }) => slug)).toEqual(["padel-past", "tennis-past"]);
  });

  it("blijft leeg zonder kandidaten", () => {
    expect(resolveLiveCandidates([], now)).toEqual({ kind: "empty" });
  });
});
