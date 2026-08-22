import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { HistoryRepository, HistoryRepositoryError } from "./repository";

const MEMBER_ID = "22222222-2222-4222-8222-222222222222";

describe("history repository", () => {
  it("uses only narrow JWT-scoped RPC calls", async () => {
    const rpc = vi.fn(async (...args: unknown[]) => { void args; return { data: [], error: null }; });
    const repository = new HistoryRepository({ rpc } as unknown as SupabaseClient);
    await repository.history(); await repository.clubmates(); await repository.sharedHistory(MEMBER_ID);
    expect(rpc.mock.calls.map((call) => call[0])).toEqual(["my_tos_history", "my_tos_clubmates", "my_shared_tos_history"]);
    expect(rpc).not.toHaveBeenCalledWith(expect.stringContaining("service"), expect.anything());
  });

  it("fails closed for malformed identifiers and leaked data", async () => {
    const rpc = vi.fn(async (...args: unknown[]) => { void args; return { data: [{ event_id: "private" }], error: null }; });
    const repository = new HistoryRepository({ rpc } as unknown as SupabaseClient);
    await expect(repository.sharedHistory("attacker")).rejects.toBeInstanceOf(HistoryRepositoryError);
    await expect(repository.history()).rejects.toBeInstanceOf(HistoryRepositoryError);
  });
});
