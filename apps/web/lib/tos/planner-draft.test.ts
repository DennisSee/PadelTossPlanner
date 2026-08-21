import { describe, expect, it } from "vitest";

import {
  editablePlannerPlayers,
  emptyPlannerDraft,
  importRegistrations,
  InvalidPlannerDraftError,
  parsePlannerDraftRow,
  reconcileEditableDraft,
  validatePlannerAvailability,
} from "./planner-draft";
import type { PlannerDraft, StaffPlannerInput, TosEvent } from "./types";

const event: TosEvent = Object.freeze({
  id: "11111111-1111-4111-8111-111111111111", slug: "planner-padel", title: "Planner",
  sport: "padel", startsAt: "2026-08-21T18:00:00Z", endsAt: "2026-08-21T20:00:00Z",
  signupDeadline: null, status: "closed",
  maxParticipants: 24,
});

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    event_id: event.id,
    players: [],
    selected_courts: ["Kremer Baan", "ZGA/F&F Baan"],
    match_minutes: 20, rest_minutes: 0, search_profile: "Normaal",
    allow_repeat_partners: false, level_mix: 50, team_difference_tolerance: 0.5,
    revision: 1, updated_by: null, updated_by_name: null,
    updated_at: "2026-08-20T10:00:00Z", created_at: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

describe("event-scoped planner drafts", () => {
  it("uses the explicit missing-draft defaults without writing", () => {
    expect(emptyPlannerDraft(event)).toMatchObject({
      players: [], selectedCourts: ["Kremer Baan", "ZGA/F&F Baan"], matchMinutes: 20,
      restMinutes: 0, searchProfile: "Normaal", revision: 0,
    });
  });

  it("parses canonical private rows but exposes only safe editable fields", () => {
    const draft = parsePlannerDraftRow(storedRow({ players: [{
      row_id: "22222222-2222-4222-8222-222222222222", name: "Dennis", ranking: 4,
      included: true, available_from: "20:00", available_until: "22:00",
      member_id: "33333333-3333-4333-8333-333333333333",
      user_id: "44444444-4444-4444-8444-444444444444",
      registration_id: "55555555-5555-4555-8555-555555555555",
      registration_updated_at: "2026-08-20T10:00:00Z", source_event_id: event.id,
    }] }));
    expect(draft.players[0].memberId).toBe("33333333-3333-4333-8333-333333333333");
    expect(editablePlannerPlayers(event, draft.players)).toEqual([{
      rowId: "22222222-2222-4222-8222-222222222222", name: "Dennis", ranking: 4,
      included: true, availableFrom: "20:00", availableUntil: "22:00", linked: true,
    }]);
  });

  it("treats null availability as the complete event and only accepts integer rankings", () => {
    const draft = parsePlannerDraftRow(storedRow({ players: [{
      row_id: "22222222-2222-4222-8222-222222222222", name: "Dennis", ranking: 4,
      included: true, available_from: null, available_until: null,
    }] }));
    expect(editablePlannerPlayers(event, draft.players)[0]).toMatchObject({ availableFrom: "20:00", availableUntil: "22:00" });
    expect(() => parsePlannerDraftRow(storedRow({ players: [{
      row_id: "22222222-2222-4222-8222-222222222222", name: "Dennis", ranking: 4.5,
      included: true, available_from: null, available_until: null,
    }] }))).toThrow(InvalidPlannerDraftError);
  });

  it("preserves linked identity server-side and assigns identity-free manual rows", () => {
    const draft = parsePlannerDraftRow(storedRow({ players: [{
      row_id: "22222222-2222-4222-8222-222222222222", name: "Dennis", ranking: 4,
      included: true, available_from: "20:00", available_until: "22:00",
      member_id: "33333333-3333-4333-8333-333333333333",
    }] }));
    const write = reconcileEditableDraft(event, draft, [
      { rowId: draft.players[0].rowId, name: "Dennis S.", ranking: 4, included: true, availableFrom: "20:07", availableUntil: "22:00" },
      { rowId: "", name: "Handmatig", ranking: 3, included: true, availableFrom: "20:00", availableUntil: "22:00" },
    ], {
      selectedCourts: ["Kremer Baan"], matchMinutes: 20, restMinutes: 0,
      searchProfile: "Snel", allowRepeatPartners: false, levelMix: 40, teamDifferenceTolerance: 0.5,
    }, () => "66666666-6666-4666-8666-666666666666");
    expect(write.players[0].memberId).toBe("33333333-3333-4333-8333-333333333333");
    expect(write.players[1]).not.toHaveProperty("memberId");
  });

  it("supports midnight availability and rejects out-of-event values", () => {
    const midnight = { ...event, startsAt: "2026-08-21T21:47:00Z", endsAt: "2026-08-21T23:27:00Z" };
    expect(() => validatePlannerAvailability(midnight, "23:47", "01:27")).not.toThrow();
    expect(() => validatePlannerAvailability(midnight, "22:00", "01:27")).toThrow(InvalidPlannerDraftError);
  });

  it("imports identity-first, updates idempotently and preserves manual rows", () => {
    const draft: PlannerDraft = { ...emptyPlannerDraft(event), revision: 1, players: [
      { rowId: "22222222-2222-4222-8222-222222222222", name: "Oude naam", ranking: 3, included: false, availableFrom: "20:00", availableUntil: "22:00", memberId: "33333333-3333-4333-8333-333333333333" },
      { rowId: "77777777-7777-4777-8777-777777777777", name: "Handmatig", ranking: 2, included: true, availableFrom: "20:00", availableUntil: "22:00" },
    ] };
    const registration: StaffPlannerInput = {
      registrationId: "55555555-5555-4555-8555-555555555555", userId: "44444444-4444-4444-8444-444444444444",
      memberId: "33333333-3333-4333-8333-333333333333", response: "attending",
      availableFrom: event.startsAt, availableUntil: event.endsAt, registrationUpdatedAt: "2026-08-20T10:00:00Z",
      displayName: "Nieuwe naam", approvalStatus: "approved", memberActive: true, sportProfileActive: true, ranking: 4,
    };
    const first = importRegistrations(event, draft, [registration], () => "88888888-8888-4888-8888-888888888888");
    expect(first.preview[0].disposition).toBe("update");
    expect(first.players).toHaveLength(2);
    expect(first.players[0]).toMatchObject({ rowId: draft.players[0].rowId, name: "Nieuwe naam", included: true });
    expect(first.players[1].name).toBe("Handmatig");
    const second = importRegistrations(event, { ...draft, players: first.players }, [registration], () => "99999999-9999-4999-8999-999999999999");
    expect(second.preview[0].disposition).toBe("unchanged");
    expect(second.players).toHaveLength(2);
  });

  it("never imports declined, blocked, or ambiguous legacy names", () => {
    const base: StaffPlannerInput = {
      registrationId: "55555555-5555-4555-8555-555555555555", userId: "44444444-4444-4444-8444-444444444444",
      memberId: "33333333-3333-4333-8333-333333333333", response: "attending",
      availableFrom: event.startsAt, availableUntil: event.endsAt, registrationUpdatedAt: "2026-08-20T10:00:00Z",
      displayName: "Zelfde naam", approvalStatus: "approved", memberActive: true, sportProfileActive: true, ranking: 4,
    };
    const draft = { ...emptyPlannerDraft(event), revision: 1, players: [{ rowId: "22222222-2222-4222-8222-222222222222", name: "Zelfde naam", ranking: 3, included: true, availableFrom: "20:00", availableUntil: "22:00" }] };
    const result = importRegistrations(event, draft, [
      base,
      { ...base, registrationId: "66666666-6666-4666-8666-666666666666", memberId: "77777777-7777-4777-8777-777777777777", displayName: "Afgemeld", response: "declined", availableFrom: null, availableUntil: null },
      { ...base, registrationId: "88888888-8888-4888-8888-888888888888", memberId: "99999999-9999-4999-8999-999999999999", displayName: "Pending", approvalStatus: "pending" },
    ], () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(result.preview.map((item) => item.disposition)).toEqual(["legacy-name-conflict", "declined", "approval"]);
    expect(result.players).toHaveLength(1);
  });

  it("reports a linked rename collision instead of overwriting a manual row", () => {
    const draft: PlannerDraft = { ...emptyPlannerDraft(event), revision: 1, players: [
      { rowId: "22222222-2222-4222-8222-222222222222", name: "Oude naam", ranking: 3, included: true, availableFrom: null, availableUntil: null, memberId: "33333333-3333-4333-8333-333333333333" },
      { rowId: "44444444-4444-4444-8444-444444444444", name: "Nieuwe naam", ranking: 2, included: true, availableFrom: null, availableUntil: null },
    ] };
    const result = importRegistrations(event, draft, [{
      registrationId: "55555555-5555-4555-8555-555555555555", userId: "66666666-6666-4666-8666-666666666666",
      memberId: "33333333-3333-4333-8333-333333333333", response: "attending",
      availableFrom: event.startsAt, availableUntil: event.endsAt, registrationUpdatedAt: "2026-08-20T10:00:00Z",
      displayName: "Nieuwe naam", approvalStatus: "approved", memberActive: true, sportProfileActive: true, ranking: 4,
    }], () => "77777777-7777-4777-8777-777777777777");
    expect(result.preview).toEqual([{ displayName: "Nieuwe naam", disposition: "legacy-name-conflict" }]);
    expect(result.players).toEqual(draft.players);
  });
});
