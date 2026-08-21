import { describe, expect, it } from "vitest";

import {
  availabilityLabel,
  derivePlannerReadiness,
  PLANNER_READINESS,
  readinessLabel,
} from "./planner-readiness";
import type { StaffPlannerInput, TosEvent } from "./types";

const event: TosEvent = Object.freeze({
  id: "11111111-1111-4111-8111-111111111111",
  slug: "vrijdag-padel",
  title: "Padel TOS",
  sport: "padel",
  startsAt: "2026-08-21T18:00:00Z",
  endsAt: "2026-08-21T20:00:00Z",
  signupDeadline: null,
  status: "closed",
  maxParticipants: 24,
});

function participant(overrides: Partial<StaffPlannerInput> = {}): StaffPlannerInput {
  return Object.freeze({
    registrationId: "22222222-2222-4222-8222-222222222222",
    userId: "33333333-3333-4333-8333-333333333333",
    memberId: "44444444-4444-4444-8444-444444444444",
    response: "attending",
    availableFrom: event.startsAt,
    availableUntil: event.endsAt,
    registrationUpdatedAt: "2026-08-20T10:00:00Z",
    displayName: "Dennis",
    approvalStatus: "approved",
    memberActive: true,
    sportProfileActive: true,
    ranking: 4,
    ...overrides,
  });
}

describe("planner readiness", () => {
  it.each([
    [{ response: "declined", availableFrom: null, availableUntil: null }, PLANNER_READINESS.DECLINED],
    [{ approvalStatus: "pending" }, PLANNER_READINESS.APPROVAL_PENDING],
    [{ approvalStatus: "rejected" }, PLANNER_READINESS.APPROVAL_REJECTED],
    [{ memberActive: false }, PLANNER_READINESS.MEMBER_INACTIVE],
    [{ sportProfileActive: false }, PLANNER_READINESS.SPORT_PROFILE_INACTIVE],
    [{ ranking: null }, PLANNER_READINESS.RANKING_MISSING],
  ] as const)("derives %s as %s", (override, expected) => {
    expect(derivePlannerReadiness(event, participant(override))).toBe(expected);
  });

  it.each([
    { availableFrom: null },
    { availableUntil: null },
    { availableFrom: "2026-08-21T17:59:00Z" },
    { availableUntil: "2026-08-21T20:01:00Z" },
    { availableFrom: "2026-08-21T19:00:00Z", availableUntil: "2026-08-21T19:00:00Z" },
    { availableFrom: "2026-08-21T19:01:00Z", availableUntil: "2026-08-21T19:00:00Z" },
  ])("rejects invalid availability %o before membership checks", (override) => {
    expect(derivePlannerReadiness(event, participant({
      approvalStatus: "pending",
      ...override,
    }))).toBe(PLANNER_READINESS.AVAILABILITY_INVALID);
  });

  it("accepts full-event and non-five-minute availability", () => {
    expect(derivePlannerReadiness(event, participant())).toBe(PLANNER_READINESS.READY);
    const partial = participant({
      availableFrom: "2026-08-21T18:07:00Z",
      availableUntil: "2026-08-21T19:43:00Z",
    });
    expect(derivePlannerReadiness(event, partial)).toBe(PLANNER_READINESS.READY);
    expect(availabilityLabel(event, participant())).toBe("Hele avond");
    expect(availabilityLabel(event, partial)).toBe("20:07–21:43");
  });

  it("handles an existing event over Amsterdam midnight by absolute instants", () => {
    const midnightEvent = {
      ...event,
      startsAt: "2026-08-21T21:00:00Z",
      endsAt: "2026-08-21T23:00:00Z",
    };
    const partial = participant({
      availableFrom: "2026-08-21T21:17:00Z",
      availableUntil: "2026-08-21T22:43:00Z",
    });
    expect(derivePlannerReadiness(midnightEvent, partial)).toBe(PLANNER_READINESS.READY);
    expect(availabilityLabel(midnightEvent, partial)).toBe("23:17–00:43");
  });

  it("keeps tennis source completeness separate from planner support", () => {
    expect(readinessLabel(PLANNER_READINESS.READY, "padel")).toBe("Klaar voor planner");
    expect(readinessLabel(PLANNER_READINESS.READY, "tennis")).toBe("Gegevens compleet");
    expect(readinessLabel(PLANNER_READINESS.RANKING_MISSING, "tennis"))
      .toBe("Tennisniveau ontbreekt");
  });
});
