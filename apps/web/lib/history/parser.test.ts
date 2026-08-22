import { describe, expect, it } from "vitest";
import { InvalidHistoryDataError, parseAcceptedContactEmail, parseContactRequests, parseHistoryClubmates, parseHistoryEvents } from "./parser";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";

describe("history RPC parsers", () => {
  it("accepts the exact private history projection and rejects extra fields", () => {
    const row = { event_id: EVENT_ID, title: "Vrijdag TOS", sport: "padel", starts_at: "2026-08-21T18:00:00Z", ends_at: "2026-08-21T20:00:00Z", match_count: 1, rest_count: 0, rounds: [{ round_number: 1, starts_at: "2026-08-21T18:00:00Z", ends_at: "2026-08-21T18:20:00Z", state: "playing", court_name: "Kremer Baan", partners: [{ member_id: MEMBER_ID, display_name: "Clubgenoot" }], opponents: [{ member_id: null, display_name: "Gast" }] }] };
    expect(parseHistoryEvents([row])[0]?.rounds[0]?.partners[0]?.memberId).toBe(MEMBER_ID);
    expect(() => parseHistoryEvents([{ ...row, email: "leak@example.test" }])).toThrow(InvalidHistoryDataError);
  });

  it("accepts only bounded clubmate and contact rows", () => {
    expect(parseHistoryClubmates([{ member_id: MEMBER_ID, display_name: "Clubgenoot", shared_matches: 2, shared_events: 1, last_shared_at: "2026-08-21T20:00:00Z" }])[0]).toMatchObject({ sharedMatches: 2 });
    expect(parseContactRequests([{ request_id: REQUEST_ID, other_member_id: MEMBER_ID, display_name: "Clubgenoot", status: "pending", direction: "incoming", created_at: "2026-08-21T20:00:00Z", responded_at: null }])[0]).toMatchObject({ direction: "incoming" });
  });

  it("never accepts malformed or expanded email responses", () => {
    expect(parseAcceptedContactEmail([{ contact_email: "Member@Example.Test" }])).toBe("member@example.test");
    expect(parseAcceptedContactEmail([])).toBeNull();
    expect(() => parseAcceptedContactEmail([{ contact_email: "member@example.test", member_id: MEMBER_ID }])).toThrow(InvalidHistoryDataError);
  });
});
