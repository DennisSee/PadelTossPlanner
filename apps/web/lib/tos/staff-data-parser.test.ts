import { describe, expect, it } from "vitest";

import { InvalidTosDataError } from "./parser";
import {
  parseStaffEventCapacityRows,
  parseStaffMemberDirectoryRows,
  parseStaffRegistrationOverviewRows,
  parseStaffSportProfileWriteResult,
} from "./staff-data-parser";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const REGISTRATION_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const MEMBER_ID = "44444444-4444-4444-8444-444444444444";

const plannerRow = {
  registration_id: REGISTRATION_ID,
  user_id: USER_ID,
  member_id: MEMBER_ID,
  response: "attending",
  available_from: "2026-08-21T18:00:00Z",
  available_until: "2026-08-21T20:00:00Z",
  registration_updated_at: "2026-08-20T10:00:00Z",
  display_name: "Dennis",
  approval_status: "approved",
  member_active: true,
  sport_profile_active: true,
  ranking: 4,
};

describe("WEB-6 staff RPC parsers", () => {
  it("accepts internally consistent capacity summaries only", () => {
    expect(parseStaffEventCapacityRows([{
      event_id: EVENT_ID,
      max_participants: 24,
      placed_count: 20,
      available_count: 4,
      waitlist_count: 3,
    }])).toEqual([{
      eventId: EVENT_ID,
      maxParticipants: 24,
      placedCount: 20,
      availableCount: 4,
      waitlistCount: 3,
    }]);
    expect(() => parseStaffEventCapacityRows([{
      event_id: EVENT_ID,
      max_participants: 24,
      placed_count: 20,
      available_count: 5,
      waitlist_count: 3,
    }])).toThrow(InvalidTosDataError);
  });

  it("separates placed, waitlist and declined overview rows", () => {
    expect(parseStaffRegistrationOverviewRows([{
      ...plannerRow,
      placement_status: "waitlist",
      waitlist_position: 2,
    }])[0]).toMatchObject({ placementStatus: "waitlist", waitlistPosition: 2 });
    expect(parseStaffRegistrationOverviewRows([{
      ...plannerRow,
      response: "declined",
      available_from: null,
      available_until: null,
      placement_status: "declined",
      waitlist_position: null,
    }])[0]).toMatchObject({ response: "declined", placementStatus: "declined" });
    expect(() => parseStaffRegistrationOverviewRows([{
      ...plannerRow,
      placement_status: "placed",
      waitlist_position: 1,
    }])).toThrow(InvalidTosDataError);
  });

  it("parses a minimal member directory and rejects private extras", () => {
    const row = {
      member_id: MEMBER_ID,
      display_name: "Dennis",
      login_email: "Dennis@Example.Test",
      approval_status: "approved",
      member_active: true,
      account_linked: true,
      padel_profile_active: true,
      padel_ranking: 4,
      tennis_profile_active: false,
      tennis_ranking: null,
    };
    expect(parseStaffMemberDirectoryRows([row])[0]).toEqual({
      memberId: MEMBER_ID,
      displayName: "Dennis",
      loginEmail: "dennis@example.test",
      approvalStatus: "approved",
      memberActive: true,
      accountLinked: true,
      padelProfileActive: true,
      padelRanking: 4,
      tennisProfileActive: false,
      tennisRanking: null,
    });
    expect(() => parseStaffMemberDirectoryRows([{ ...row, user_id: MEMBER_ID }]))
      .toThrow(InvalidTosDataError);
  });

  it("accepts an unlinked member without email and rejects malformed login email", () => {
    const base = {
      member_id: MEMBER_ID,
      display_name: "Los lid",
      login_email: null,
      approval_status: "pending",
      member_active: true,
      account_linked: false,
      padel_profile_active: false,
      padel_ranking: null,
      tennis_profile_active: false,
      tennis_ranking: null,
    };
    expect(parseStaffMemberDirectoryRows([base])[0]?.loginEmail).toBeNull();
    expect(() => parseStaffMemberDirectoryRows([{ ...base, login_email: "not-an-email" }]))
      .toThrow(InvalidTosDataError);
  });

  it("validates the single sport-profile write result", () => {
    expect(parseStaffSportProfileWriteResult([{
      member_id: MEMBER_ID,
      sport: "tennis",
      active: true,
      ranking: 3,
    }])).toEqual({ memberId: MEMBER_ID, sport: "tennis", active: true, ranking: 3 });
    expect(() => parseStaffSportProfileWriteResult([{
      member_id: MEMBER_ID,
      sport: "squash",
      active: true,
      ranking: 3,
    }])).toThrow(InvalidTosDataError);
  });
});
