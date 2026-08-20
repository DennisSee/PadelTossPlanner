import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  TosDataUnavailableError,
  TosRepository,
} from "./repository";
import {
  OWN_REGISTRATION_SELECT,
  TOS_EVENT_SELECT,
  type OwnRegistration,
} from "./types";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const REGISTRATION_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

const eventRow = {
  id: EVENT_ID,
  slug: "vrijdag-padel",
  title: "Vrijdag TOS",
  sport: "padel",
  starts_at: "2026-08-21T18:00:00Z",
  ends_at: "2026-08-21T20:00:00Z",
  signup_deadline: null,
  status: "open",
};

const registrationRow = {
  id: REGISTRATION_ID,
  event_id: EVENT_ID,
  response: "attending",
  available_from: "2026-08-21T18:07:00Z",
  available_until: "2026-08-21T19:43:00Z",
  created_at: "2026-08-20T10:00:00Z",
  updated_at: "2026-08-20T10:00:00Z",
};

type Call = readonly [string, ...unknown[]];

function fakeClient(result: { data: unknown; error: unknown; status?: number }) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "or", "order", "limit", "insert", "update"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (
    resolve: (value: typeof result) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  const from = vi.fn((table: string) => {
    calls.push(["from", table]);
    return builder;
  });
  const rpc = vi.fn(async () => result);
  return {
    calls,
    rpc,
    client: { from, rpc } as unknown as SupabaseClient,
  };
}

describe("user-scoped TOS repository", () => {
  it("reads one open event with only the public projection and validated filters", async () => {
    const fake = fakeClient({ data: [eventRow], error: null });
    const result = await new TosRepository(fake.client).eventBySlug("vrijdag-padel", { openOnly: true });
    expect(result?.id).toBe(EVENT_ID);
    expect(fake.calls).toEqual([
      ["from", "tos_events"],
      ["select", TOS_EVENT_SELECT],
      ["eq", "slug", "vrijdag-padel"],
      ["eq", "status", "open"],
      ["limit", 2],
    ]);
    expect(TOS_EVENT_SELECT).not.toContain("*");
    expect(TOS_EVENT_SELECT).not.toMatch(/created_by|created_at|updated_at/u);
  });

  it("filters an own registration by verified event and user IDs", async () => {
    const fake = fakeClient({ data: [registrationRow], error: null });
    const result = await new TosRepository(fake.client).ownRegistration(EVENT_ID, USER_ID);
    expect(result?.id).toBe(REGISTRATION_ID);
    expect(fake.calls).toEqual([
      ["from", "registrations"],
      ["select", OWN_REGISTRATION_SELECT],
      ["eq", "event_id", EVENT_ID],
      ["eq", "user_id", USER_ID],
      ["limit", 2],
    ]);
  });

  it("inserts only event and mutable response fields", async () => {
    const fake = fakeClient({ data: [registrationRow], error: null });
    await new TosRepository(fake.client).createRegistration(EVENT_ID, {
      response: "attending",
      availableFrom: registrationRow.available_from,
      availableUntil: registrationRow.available_until,
    });
    const insert = fake.calls.find(([method]) => method === "insert");
    expect(insert?.[1]).toEqual({
      event_id: EVENT_ID,
      response: "attending",
      available_from: registrationRow.available_from,
      available_until: registrationRow.available_until,
    });
    expect(Object.keys(insert?.[1] as object).sort()).toEqual([
      "available_from", "available_until", "event_id", "response",
    ]);
  });

  it("updates only mutable fields and applies all server-derived filters", async () => {
    const fake = fakeClient({ data: [{
      ...registrationRow,
      response: "declined",
      available_from: null,
      available_until: null,
    }], error: null });
    const own = {
      id: REGISTRATION_ID,
      eventId: EVENT_ID,
      response: "attending",
      availableFrom: registrationRow.available_from,
      availableUntil: registrationRow.available_until,
      createdAt: registrationRow.created_at,
      updatedAt: registrationRow.updated_at,
    } satisfies OwnRegistration;
    await new TosRepository(fake.client).updateRegistration(own, USER_ID, {
      response: "declined",
      availableFrom: null,
      availableUntil: null,
    });
    const update = fake.calls.find(([method]) => method === "update");
    expect(update?.[1]).toEqual({ response: "declined", available_from: null, available_until: null });
    expect(fake.calls.filter(([method]) => method === "eq")).toEqual([
      ["eq", "id", REGISTRATION_ID],
      ["eq", "user_id", USER_ID],
      ["eq", "event_id", EVENT_ID],
    ]);
  });

  it("uses only the two established RPC contracts", async () => {
    const names = fakeClient({ data: [{ display_name: "Dennis" }], error: null });
    await expect(new TosRepository(names.client).attendeeNames(EVENT_ID)).resolves.toEqual(["Dennis"]);
    expect(names.rpc).toHaveBeenCalledWith("participant_event_attendee_names", { p_event_id: EVENT_ID });

    const onboard = fakeClient({ data: "member-id", error: null });
    await new TosRepository(onboard.client).selfOnboard("Dennis");
    expect(onboard.rpc).toHaveBeenCalledWith("self_onboard_member", { p_display_name: "Dennis" });
  });

  it("fails closed for multiple or malformed rows", async () => {
    const multiple = fakeClient({ data: [eventRow, eventRow], error: null });
    await expect(new TosRepository(multiple.client).eventBySlug("vrijdag-padel", { openOnly: false }))
      .rejects.toBeInstanceOf(TosDataUnavailableError);
    const malformed = fakeClient({ data: [{ ...eventRow, sport: "invalid" }], error: null });
    await expect(new TosRepository(malformed.client).eventBySlug("vrijdag-padel", { openOnly: false }))
      .rejects.toBeInstanceOf(TosDataUnavailableError);
  });
});
