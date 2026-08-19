import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  InvalidPublicScheduleError,
  PUBLIC_CLIENT_OPTIONS,
  PublicScheduleRepository,
  PublicScheduleUnavailableError,
} from "./public-schedule-repository";
import { PUBLIC_SCHEDULE_COLUMNS, PUBLIC_SCHEDULE_SELECT } from "../public-schedule/types";

const payload = {
  id: "schedule-1",
  event_date: "2026-08-21",
  created_by_name: "Planner",
  start_time: "20:00",
  end_time: "22:00",
  courts: ["Kremer Baan"],
  participants_public: ["Anna"],
  schedule_public: [],
  is_published: true,
  created_at: "2026-08-20T18:00:00Z",
};

function fakeClient(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockResolvedValue(result);
  return {
    query,
    client: { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient,
  };
}

describe("server-only public schedule repository", () => {
  it("selects only the ten public columns, published rows and newest schedule", async () => {
    const fake = fakeClient({ data: [payload], error: null });
    const factory = vi.fn().mockReturnValue(fake.client);
    const repository = new PublicScheduleRepository(
      { url: "https://test.example.test", publishableKey: "sb_publishable_test" },
      factory,
    );

    await expect(repository.latestPublishedSchedule()).resolves.toMatchObject({ id: "schedule-1" });
    expect(PUBLIC_SCHEDULE_COLUMNS).toEqual([
      "id",
      "event_date",
      "created_by_name",
      "start_time",
      "end_time",
      "courts",
      "participants_public",
      "schedule_public",
      "is_published",
      "created_at",
    ]);
    expect(PUBLIC_SCHEDULE_COLUMNS).toHaveLength(10);
    expect(PUBLIC_SCHEDULE_SELECT).not.toContain("*");
    for (const privateColumn of [
      "title",
      "created_by",
      "match_minutes",
      "players_private",
      "schedule_private",
      "statistics_private",
      "diagnostics",
      "ranking",
      "Niveau T1",
      "Niveau T2",
    ]) {
      expect(PUBLIC_SCHEDULE_COLUMNS).not.toContain(privateColumn);
    }
    expect(fake.query.select).toHaveBeenCalledWith(PUBLIC_SCHEDULE_SELECT);
    expect(fake.query.eq).toHaveBeenCalledWith("is_published", true);
    expect(fake.query.order).toHaveBeenNthCalledWith(1, "event_date", { ascending: false });
    expect(fake.query.order).toHaveBeenNthCalledWith(2, "created_at", { ascending: false });
    expect(fake.query.limit).toHaveBeenCalledWith(1);
    expect(factory).toHaveBeenCalledWith("https://test.example.test", "sb_publishable_test");
  });

  it("has no persistent auth, refresh or browser session contract", () => {
    expect(PUBLIC_CLIENT_OPTIONS).toEqual({
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  });

  it("returns null for no schedule and hides backend errors", async () => {
    const empty = fakeClient({ data: [], error: null });
    const failing = fakeClient({ data: null, error: { message: "sensitive upstream detail" } });
    await expect(new PublicScheduleRepository(
      { url: "https://test.example.test", publishableKey: "sb_publishable_test" },
      () => empty.client,
    ).latestPublishedSchedule()).resolves.toBeNull();
    await expect(new PublicScheduleRepository(
      { url: "https://test.example.test", publishableKey: "sb_publishable_test" },
      () => failing.client,
    ).latestPublishedSchedule()).rejects.toEqual(new PublicScheduleUnavailableError());
  });

  it("maps malformed schedule JSON to the controlled invalid-payload error", async () => {
    const malformed = fakeClient({ data: [{ ...payload, schedule_public: [{}] }], error: null });
    await expect(new PublicScheduleRepository(
      { url: "https://test.example.test", publishableKey: "sb_publishable_test" },
      () => malformed.client,
    ).latestPublishedSchedule()).rejects.toEqual(new InvalidPublicScheduleError());
  });
});
