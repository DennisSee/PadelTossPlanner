import { describe, expect, it } from "vitest";

import type { PlannerGeneration } from "../planner-api/types";
import { buildScheduleHistoryIdentity, ScheduleHistoryIdentityError } from "./schedule-history";
import type { PlannerDraft } from "./types";

const players = [
  { rowId: "11111111-1111-4111-8111-111111111111", name: "Ann", ranking: 3, included: true, availableFrom: "20:00", availableUntil: "22:00", memberId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  { rowId: "22222222-2222-4222-8222-222222222222", name: "Anna", ranking: 3, included: true, availableFrom: "20:00", availableUntil: "22:00" },
  { rowId: "33333333-3333-4333-8333-333333333333", name: "Piet & Jan", ranking: 3, included: true, availableFrom: "20:00", availableUntil: "22:00" },
  { rowId: "44444444-4444-4444-8444-444444444444", name: "Sofie", ranking: 3, included: true, availableFrom: "20:00", availableUntil: "22:00" },
] as const;

const draft = { players } as unknown as PlannerDraft;

function generation(overrides: Partial<PlannerGeneration["schedule"][number]> = {}): PlannerGeneration {
  return {
    seed: 7,
    schedule: [{
      Ronde: 1,
      Tijd: "20:00 - 20:20",
      Baan: "Kremer Baan",
      "Team 1": "Ann & Anna",
      "Niveau T1": 3,
      "Team 2": "Piet & Jan & Sofie",
      "Niveau T2": 3,
      Teamverschil: 0,
      Rust: "Niemand",
      "Nog niet aanwezig": "Niemand",
      "Niet meer beschikbaar": "Niemand",
      ...overrides,
    }],
    statistics: [],
    diagnostics: {},
  };
}

describe("buildScheduleHistoryIdentity", () => {
  it("maps exact player names to private stable row identities", () => {
    const result = buildScheduleHistoryIdentity(draft, generation());
    expect(result[0]["Team 1"].map((player) => player.name)).toEqual(["Ann", "Anna"]);
    expect(result[0]["Team 2"].map((player) => player.name)).toEqual(["Piet & Jan", "Sofie"]);
    expect(JSON.stringify(result)).not.toContain("memberId");
  });

  it("maps rest and availability states without inventing identities", () => {
    const result = buildScheduleHistoryIdentity(draft, generation({
      "Team 1": "Ann & Anna",
      "Team 2": "Piet & Jan & Sofie",
      Rust: "Ann, Sofie",
      "Nog niet aanwezig": "Anna",
    }));
    expect(result[0].Rust.map((player) => player.row_id)).toEqual([
      players[0].rowId,
      players[3].rowId,
    ]);
    expect(result[0]["Nog niet aanwezig"][0].name).toBe("Anna");
  });

  it("fails closed for an unknown or ambiguous schedule identity", () => {
    expect(() => buildScheduleHistoryIdentity(draft, generation({ "Team 1": "Onbekend & Anna" })))
      .toThrow(ScheduleHistoryIdentityError);
    const ambiguous = { ...draft, players: [...players, { ...players[0], rowId: "55555555-5555-4555-8555-555555555555" }] } as PlannerDraft;
    expect(() => buildScheduleHistoryIdentity(ambiguous, generation())).toThrow(ScheduleHistoryIdentityError);
  });
});
