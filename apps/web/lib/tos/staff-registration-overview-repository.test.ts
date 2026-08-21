import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  StaffRegistrationOverviewDataError,
  StaffRegistrationOverviewRepository,
} from "./staff-registration-overview-repository";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

describe("staff registration overview repository", () => {
  it("uses exactly one event-scoped RPC", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const client = { rpc } as unknown as SupabaseClient;
    await expect(new StaffRegistrationOverviewRepository(client).forEvent(EVENT_ID))
      .resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith("staff_event_registration_overview", {
      p_event_id: EVENT_ID,
    });
  });

  it("fails before any call for an untrusted event id", async () => {
    const rpc = vi.fn();
    const client = { rpc } as unknown as SupabaseClient;
    await expect(new StaffRegistrationOverviewRepository(client).forEvent("attacker"))
      .rejects.toBeInstanceOf(StaffRegistrationOverviewDataError);
    expect(rpc).not.toHaveBeenCalled();
  });
});
