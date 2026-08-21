import { describe, expect, it } from "vitest";

import { InvalidTosDataError } from "./parser";
import { parseStaffPlannerInput, parseStaffPlannerInputRows } from "./staff-planner-input-parser";

function row(overrides: Record<string, unknown> = {}) {
  return {
    registration_id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    member_id: "33333333-3333-4333-8333-333333333333",
    response: "attending",
    available_from: "2026-08-21T18:07:00Z",
    available_until: "2026-08-21T19:43:00+00:00",
    registration_updated_at: "2026-08-20T10:00:00Z",
    display_name: " Dennis ",
    approval_status: "approved",
    member_active: true,
    sport_profile_active: true,
    ranking: 4,
    ...overrides,
  };
}

describe("staff planner-input parser", () => {
  it("maps the exact RPC result without exposing alternate fields", () => {
    expect(parseStaffPlannerInput(row())).toEqual({
      registrationId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      memberId: "33333333-3333-4333-8333-333333333333",
      response: "attending",
      availableFrom: "2026-08-21T18:07:00Z",
      availableUntil: "2026-08-21T19:43:00+00:00",
      registrationUpdatedAt: "2026-08-20T10:00:00Z",
      displayName: "Dennis",
      approvalStatus: "approved",
      memberActive: true,
      sportProfileActive: true,
      ranking: 4,
    });
    expect(() => parseStaffPlannerInput({ ...row(), email: "private@example.test" }))
      .toThrow(InvalidTosDataError);
  });

  it("accepts declined and syntactically valid attending rows with null availability", () => {
    expect(parseStaffPlannerInput(row({
      response: "declined",
      available_from: null,
      available_until: null,
      ranking: null,
    }))).toMatchObject({ response: "declined", availableFrom: null, ranking: null });
    expect(parseStaffPlannerInput(row({ available_from: null, available_until: null })))
      .toMatchObject({ response: "attending", availableFrom: null, availableUntil: null });
  });

  it.each([
    { registration_id: "not-a-uuid" },
    { user_id: "not-a-uuid" },
    { member_id: "not-a-uuid" },
    { response: "maybe" },
    { display_name: "  " },
    { display_name: "Naam\u0007" },
    { approval_status: "unknown" },
    { member_active: "true" },
    { sport_profile_active: 1 },
    { ranking: 0 },
    { ranking: 6 },
    { ranking: 4.5 },
    { ranking: "4" },
    { ranking: true },
    { available_from: "2026-08-21T18:00:00" },
    { available_from: "malformed" },
    { available_until: "malformed" },
    { registration_updated_at: "2026-08-20T10:00:00" },
  ])("fails malformed RPC data closed: %o", (override) => {
    expect(() => parseStaffPlannerInput(row(override))).toThrow(InvalidTosDataError);
  });

  it.each([1, 5, null])("accepts an exact valid ranking value %s", (ranking) => {
    expect(parseStaffPlannerInput(row({ ranking })).ranking).toBe(ranking);
  });

  it("fails the whole result when one row is malformed", () => {
    expect(() => parseStaffPlannerInputRows([row(), row({ ranking: "4" })]))
      .toThrow(InvalidTosDataError);
    expect(parseStaffPlannerInputRows([])).toEqual([]);
  });
});
