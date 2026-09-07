import { describe, expect, it } from "vitest";

import { parsePlannerQualitySummary } from "./quality";

describe("planner quality summary", () => {
  it("accepts the finite identity-free engine shape", () => {
    expect(parsePlannerQualitySummary({ quality_summary: {
      partner_repeats: 1, opponent_repeats: 6, max_rest_difference: 0,
      max_team_difference: 0.8, compromises: ["PARTNER_REPEATS", "OPPONENT_REPEATS"],
    } })).toEqual({ partnerRepeats: 1, opponentRepeats: 6, maxRestDifference: 0, maxTeamDifference: 0.8, compromises: ["PARTNER_REPEATS", "OPPONENT_REPEATS"] });
  });

  it.each([
    {},
    { quality_summary: { partner_repeats: -1, opponent_repeats: 0, max_rest_difference: 0, max_team_difference: 0, compromises: [] } },
    { quality_summary: { partner_repeats: 0, opponent_repeats: 0, max_rest_difference: 0, max_team_difference: 0, compromises: ["PRIVATE_DEBUG"] } },
  ])("fails closed for missing or malformed quality metadata", (diagnostics) => {
    expect(parsePlannerQualitySummary(diagnostics)).toBeNull();
  });
});
