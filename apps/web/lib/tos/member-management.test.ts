import { describe, expect, it } from "vitest";

import {
  InvalidMemberManagementRequestError,
  validateSportProfileWrite,
} from "./member-management";

const MEMBER_ID = "44444444-4444-4444-8444-444444444444";

describe("staff sport-profile input", () => {
  it("accepts independent padel/tennis state and nullable ranking", () => {
    expect(validateSportProfileWrite({
      memberId: MEMBER_ID,
      sport: "padel",
      active: "true",
      ranking: "4",
    })).toEqual({ memberId: MEMBER_ID, sport: "padel", active: true, ranking: 4 });
    expect(validateSportProfileWrite({
      memberId: MEMBER_ID,
      sport: "tennis",
      active: "false",
      ranking: "",
    })).toEqual({ memberId: MEMBER_ID, sport: "tennis", active: false, ranking: null });
  });

  it.each([
    { memberId: "attacker", sport: "padel", active: "true", ranking: "4" },
    { memberId: MEMBER_ID, sport: "squash", active: "true", ranking: "4" },
    { memberId: MEMBER_ID, sport: "padel", active: "on", ranking: "4" },
    { memberId: MEMBER_ID, sport: "padel", active: "true", ranking: "0" },
    { memberId: MEMBER_ID, sport: "padel", active: "true", ranking: "6" },
    { memberId: MEMBER_ID, sport: "padel", active: "true", ranking: "4.5" },
  ])("rejects invalid or forged sport-profile input %#", (input) => {
    expect(() => validateSportProfileWrite(input)).toThrow(InvalidMemberManagementRequestError);
  });
});
