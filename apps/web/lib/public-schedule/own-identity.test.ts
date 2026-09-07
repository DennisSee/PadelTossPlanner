import { describe, expect, it, vi } from "vitest";
import { loadOwnLivePlayerKey } from "./own-identity";
import { parseLiveIdentity } from "./identity";
import type { AccountContext } from "../auth/account-context";
vi.mock("server-only", () => ({}));
vi.mock("../supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
const key = "a4600000-0000-4000-8000-000000000001";
const other = "a4600000-0000-4000-8000-000000000002";
const account = { capabilities: { canParticipate: true } } as AccountContext;
const factory = (data: unknown, error: unknown = null) => vi.fn().mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ data, error }) });

describe("own live identity", () => {
  it("loads exactly the caller key for the current publication", async () => {
    const client = factory([{ schedule_id: "schedule", player_key: key }]);
    expect(await loadOwnLivePlayerKey(account, "live-event", "schedule", client)).toBe(key);
    expect(client).toHaveBeenCalledTimes(1);
    expect((await client()).rpc).toHaveBeenCalledWith("my_published_event_schedule_identity", { p_slug: "live-event" });
  });
  it.each([null, { capabilities: { canParticipate: false, canPlan: true } }])("skips lookup without participant authority", async (viewer) => {
    const client = factory([]);
    expect(await loadOwnLivePlayerKey(viewer as AccountContext | null, "live-event", "schedule", client)).toBeNull();
    expect(client).not.toHaveBeenCalled();
  });
  it.each([[], [{ schedule_id: "old", player_key: key }], [{ schedule_id: "schedule", player_key: key, member_id: other }], [{ schedule_id: "schedule", player_key: "Same name" }]].map((data) => ({ data })))("fails closed without name fallback", async ({ data }) => {
    expect(await loadOwnLivePlayerKey(account, "live-event", "schedule", factory(data))).toBeNull();
  });
  it("isolates RPC failures from public rendering", async () => {
    expect(await loadOwnLivePlayerKey(account, "live-event", "schedule", vi.fn().mockRejectedValue(new Error("private")))).toBeNull();
  });
  it("preserves different opaque keys with identical display names", () => {
    const parsed = parseLiveIdentity({ players: [{ key, name: "Same name" }, { key: other, name: "Same name" }], rounds: [{ number: 1, starts_at: "2026-09-07T18:00:00Z", ends_at: "2026-09-07T18:20:00Z", slots: [key, other].map((value) => ({ key: value, state: "rest", court: null, team: null })) }] });
    expect(parsed?.players.map((player) => player.key)).toEqual([key, other]);
    expect(parseLiveIdentity({ players: [{ key, name: "Same name", member_id: other }], rounds: [] })).toBeNull();
  });
});
