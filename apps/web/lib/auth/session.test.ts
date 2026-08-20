import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { destinationForAccount, verifiedIdentity } from "./session";
import { deriveAccountContext } from "./account-context";

describe("verified SSR identity and destination", () => {
  it("uses getClaims and normalizes the claim email", async () => {
    const getClaims = vi.fn().mockResolvedValue({
      data: { claims: { sub: "user-1", email: " Member@Example.Test " } },
      error: null,
    });
    const client = { auth: { getClaims } } as unknown as SupabaseClient;
    await expect(verifiedIdentity(client)).resolves.toEqual({
      userId: "user-1",
      email: "member@example.test",
    });
    expect(getClaims).toHaveBeenCalledTimes(1);
  });

  it("fails closed for missing or invalid claims", async () => {
    const client = {
      auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: {} }, error: null }) },
    } as unknown as SupabaseClient;
    await expect(verifiedIdentity(client)).resolves.toBeNull();
  });

  it("allows management return only for staff", () => {
    const identity = { userId: "user-1", email: "member@example.test" };
    const participant = deriveAccountContext(identity, {
      id: "user-1", display_name: "Member", role: "participant", active: true, member_id: null,
    }, null);
    const planner = deriveAccountContext(identity, {
      id: "user-1", display_name: "Planner", role: "planner", active: true, member_id: null,
    }, null);
    expect(destinationForAccount("/beheer", participant)).toBe("/tos");
    expect(destinationForAccount("/beheer", planner)).toBe("/beheer");
    expect(destinationForAccount("/account", participant)).toBe("/account");
  });
});
