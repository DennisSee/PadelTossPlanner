import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  StaffPlannerInputDataError,
  StaffPlannerInputRepository,
} from "./staff-planner-input-repository";

const validRow = {
  registration_id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  member_id: "33333333-3333-4333-8333-333333333333",
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

function fakeClient(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  const from = vi.fn(() => { throw new Error("table fallback is forbidden"); });
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

describe("staff planner-input repository", () => {
  it("calls only the exact event-scoped RPC parameter", async () => {
    const fake = fakeClient({ data: [validRow], error: null });
    await expect(new StaffPlannerInputRepository(fake.client).plannerInputForEvent(
      "44444444-4444-4444-8444-444444444444",
    )).resolves.toHaveLength(1);
    expect(fake.rpc).toHaveBeenCalledWith("staff_event_planner_input", {
      p_event_id: "44444444-4444-4444-8444-444444444444",
    });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("accepts an empty result and fails database/malformed data safely", async () => {
    await expect(new StaffPlannerInputRepository(fakeClient({ data: [], error: null }).client)
      .plannerInputForEvent("44444444-4444-4444-8444-444444444444")).resolves.toEqual([]);
    await expect(new StaffPlannerInputRepository(fakeClient({ data: null, error: { message: "private" } }).client)
      .plannerInputForEvent("44444444-4444-4444-8444-444444444444"))
      .rejects.toBeInstanceOf(StaffPlannerInputDataError);
    await expect(new StaffPlannerInputRepository(fakeClient({ data: [{ ...validRow, ranking: "4" }], error: null }).client)
      .plannerInputForEvent("44444444-4444-4444-8444-444444444444"))
      .rejects.toBeInstanceOf(StaffPlannerInputDataError);
  });

  it("rejects a non-server UUID before making any request", async () => {
    const fake = fakeClient({ data: [], error: null });
    await expect(new StaffPlannerInputRepository(fake.client).plannerInputForEvent("not-a-uuid"))
      .rejects.toBeInstanceOf(StaffPlannerInputDataError);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});
