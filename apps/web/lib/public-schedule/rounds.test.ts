import { describe, expect, it } from "vitest";

import {
  buildTimedRounds,
  formatEventDate,
  getLiveRoundState,
  groupScheduleRows,
  personalScheduleRows,
} from "./rounds";
import type { PublicScheduleRow } from "./types";

function row(overrides: Partial<PublicScheduleRow> = {}): PublicScheduleRow {
  return {
    Ronde: "1",
    Tijd: "20:00–20:20",
    Baan: "Kremer Baan",
    "Team 1": "Anna & Bram",
    "Team 2": "Cato & Daan",
    Rust: "Eva",
    "Nog niet aanwezig": "Fleur",
    "Niet meer beschikbaar": "Gijs",
    ...overrides,
  };
}

describe("public schedule round logic", () => {
  it("groups rows and sorts round numbers numerically", () => {
    const grouped = groupScheduleRows([
      row({ Ronde: "10", Baan: "Baan 2" }),
      row({ Ronde: "2", Baan: "Baan 1" }),
      row({ Ronde: "2", Baan: "Baan 2" }),
    ]);
    expect(grouped.map((round) => round.roundNumber)).toEqual(["2", "10"]);
    expect(grouped[0].rows).toHaveLength(2);
  });

  it("interprets summer and winter rounds in Europe/Amsterdam", () => {
    const summer = buildTimedRounds([row()], "2026-08-21")[0];
    const winter = buildTimedRounds([row()], "2026-12-21")[0];
    expect(summer.startsAt.toISOString()).toBe("2026-08-21T18:00:00.000Z");
    expect(winter.startsAt.toISOString()).toBe("2026-12-21T19:00:00.000Z");
  });

  it("supports a round and following rounds across midnight", () => {
    const timed = buildTimedRounds([
      row({ Ronde: "1", Tijd: "23:50–00:10" }),
      row({ Ronde: "2", Tijd: "00:10–00:30" }),
    ], "2026-08-21");
    expect(timed[0].endsAt.toISOString()).toBe("2026-08-21T22:10:00.000Z");
    expect(timed[1].startsAt.toISOString()).toBe("2026-08-21T22:10:00.000Z");
    expect(timed[1].endsAt.toISOString()).toBe("2026-08-21T22:30:00.000Z");
  });

  it("keeps several rounds after midnight on the same next calendar day", () => {
    const timed = buildTimedRounds([
      row({ Ronde: "1", Tijd: "23:40–00:00" }),
      row({ Ronde: "2", Tijd: "00:05–00:25" }),
      row({ Ronde: "3", Tijd: "00:30–00:50" }),
    ], "2026-08-21");
    expect(timed.map((round) => [round.startsAt.toISOString(), round.endsAt.toISOString()])).toEqual([
      ["2026-08-21T21:40:00.000Z", "2026-08-21T22:00:00.000Z"],
      ["2026-08-21T22:05:00.000Z", "2026-08-21T22:25:00.000Z"],
      ["2026-08-21T22:30:00.000Z", "2026-08-21T22:50:00.000Z"],
    ]);
    expect(getLiveRoundState(
      timed.flatMap((round) => round.rows),
      "2026-08-21",
      new Date("2026-08-21T22:02:00.000Z"),
    ).kind).toBe("between");
  });

  it("uses the Amsterdam timezone database across the spring DST transition", () => {
    const timed = buildTimedRounds([
      row({ Tijd: "01:30–03:30" }),
    ], "2026-03-29")[0];
    expect(timed.startsAt.toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(timed.endsAt.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(timed.endsAt.getTime() - timed.startsAt.getTime()).toBe(60 * 60 * 1000);
  });

  it("reports before, current, between and after states", () => {
    const rows = [
      row({ Ronde: "1", Tijd: "20:00–20:20" }),
      row({ Ronde: "2", Tijd: "20:25–20:45" }),
    ];
    expect(getLiveRoundState(rows, "2026-08-21", new Date("2026-08-21T17:55:00Z")).kind).toBe("before");
    expect(getLiveRoundState(rows, "2026-08-21", new Date("2026-08-21T18:05:00Z")).kind).toBe("current");
    expect(getLiveRoundState(rows, "2026-08-21", new Date("2026-08-21T18:22:00Z")).kind).toBe("between");
    expect(getLiveRoundState(rows, "2026-08-21", new Date("2026-08-21T18:50:00Z")).kind).toBe("after");
  });

  it("marks the next round urgent inside the two-minute lead window", () => {
    const state = getLiveRoundState(
      [row({ Tijd: "20:00–20:20" }), row({ Ronde: "2", Tijd: "20:22–20:42" })],
      "2026-08-21",
      new Date("2026-08-21T18:20:30Z"),
    );
    expect(state.kind).toBe("between");
    if (state.kind === "between") {
      expect(state.nextIsUrgent).toBe(true);
      expect(state.startsInMinutes).toBe(2);
    }
  });

  it.each([
    ["one second before first start", "2026-08-21T17:59:59.000Z", "before", null],
    ["exactly at first start", "2026-08-21T18:00:00.000Z", "current", "1"],
    ["one second before first end", "2026-08-21T18:19:59.000Z", "current", "1"],
    ["exactly at first end", "2026-08-21T18:20:00.000Z", "between", null],
    ["one second after first end", "2026-08-21T18:20:01.000Z", "between", null],
    ["exactly at next start", "2026-08-21T18:25:00.000Z", "current", "2"],
    ["exactly at final end", "2026-08-21T18:45:00.000Z", "after", null],
  ])("uses half-open round windows %s", (_label, now, kind, currentRound) => {
    const state = getLiveRoundState([
      row({ Ronde: "1", Tijd: "20:00–20:20" }),
      row({ Ronde: "2", Tijd: "20:25–20:45" }),
    ], "2026-08-21", new Date(now));
    expect(state.kind).toBe(kind);
    if (state.kind === "current") {
      expect(state.current.roundNumber).toBe(currentRound);
    }
  });

  it.each([
    ["just outside", "2026-08-21T18:22:59.000Z", false],
    ["exactly two minutes", "2026-08-21T18:23:00.000Z", true],
    ["just inside", "2026-08-21T18:23:01.000Z", true],
  ])("applies the two-minute lead window %s", (_label, now, urgent) => {
    const state = getLiveRoundState([
      row({ Ronde: "1", Tijd: "20:00–20:20" }),
      row({ Ronde: "2", Tijd: "20:25–20:45" }),
    ], "2026-08-21", new Date(now));
    expect(state.kind).toBe("between");
    if (state.kind === "between") {
      expect(state.nextIsUrgent).toBe(urgent);
    }
  });

  it("returns untimed for unknown round times", () => {
    expect(getLiveRoundState([row({ Tijd: "later" })], "2026-08-21", new Date()).kind).toBe("untimed");
  });

  it("builds case-insensitive personal playing, rest and availability states", () => {
    expect(personalScheduleRows([row()], "anna")[0].status).toBe("playing");
    expect(personalScheduleRows([row()], "EVA")[0].status).toBe("rest");
    expect(personalScheduleRows([row()], "fleur")[0].status).toBe("not-arrived");
    expect(personalScheduleRows([row()], "GIJS")[0].status).toBe("unavailable");
  });

  it("matches exact names in either team without partial-name matches", () => {
    const match = row({ "Team 1": "Anna & Bram", "Team 2": "Cato & Daan" });
    expect(personalScheduleRows([match], "ANNA")[0].status).toBe("playing");
    expect(personalScheduleRows([match], "daan")[0].status).toBe("playing");
    expect(personalScheduleRows([match], "Ann")).toEqual([]);
  });

  it("splits comma-separated status names and trims separator whitespace", () => {
    const statuses = row({
      "Team 1": "Anna & Bram",
      "Team 2": "Cato & Daan",
      Rust: " Eva,  Hugo ,Iris ",
      "Nog niet aanwezig": " Fleur, Jip ",
      "Niet meer beschikbaar": " Gijs, Kiki ",
    });
    expect(personalScheduleRows([statuses], "hugo")[0].status).toBe("rest");
    expect(personalScheduleRows([statuses], "JIP")[0].status).toBe("not-arrived");
    expect(personalScheduleRows([statuses], "kiki")[0].status).toBe("unavailable");
  });

  it("keeps the legacy conflict priority playing, not-arrived, unavailable, rest", () => {
    expect(personalScheduleRows([row({ Rust: "Anna" })], "Anna")[0].status).toBe("playing");
    expect(personalScheduleRows([row({
      Rust: "Eva",
      "Nog niet aanwezig": "Eva",
    })], "Eva")[0].status).toBe("not-arrived");
    expect(personalScheduleRows([row({
      "Nog niet aanwezig": "Fleur",
      "Niet meer beschikbaar": "Fleur",
    })], "Fleur")[0].status).toBe("not-arrived");
  });

  it("formats the Dutch event date", () => {
    expect(formatEventDate("2026-08-21")).toBe("vrijdag 21 augustus 2026");
  });
});
