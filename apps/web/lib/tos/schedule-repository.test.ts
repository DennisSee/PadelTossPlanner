import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { StaffScheduleConflictError, StaffSchedulePublicationError, StaffScheduleRepository } from "./schedule-repository";

const eventId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";

it("uses only narrow event schedule RPCs and parses summaries", async () => {
  const rpc = vi.fn()
    .mockResolvedValueOnce({ data: [{ id: scheduleId, event_id: eventId, created_by: "33333333-3333-4333-8333-333333333333", created_by_name: "Planner", is_published: false, generation_seed: 7, planner_draft_revision: 2, created_at: "2026-08-21T10:00:00Z" }], error: null })
    .mockResolvedValueOnce({ data: true, error: null });
  const repository = new StaffScheduleRepository({ rpc } as unknown as SupabaseClient);
  await expect(repository.list(eventId)).resolves.toMatchObject([{ id: scheduleId, eventId, generationSeed: 7 }]);
  await expect(repository.setPublished(scheduleId, true)).resolves.toBeUndefined();
  expect(rpc).toHaveBeenNthCalledWith(1, "staff_event_schedule_summaries", { p_event_id: eventId });
  expect(rpc).toHaveBeenNthCalledWith(2, "staff_set_schedule_published", { p_schedule_id: scheduleId, p_published: true });
});

it("parses event-scoped private detail without exposing the players snapshot", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: [{
    id: scheduleId, event_id: eventId, created_by: "33333333-3333-4333-8333-333333333333",
    created_by_name: "Planner", title: "Vrijdag", event_date: "2026-08-21", start_time: "20:00",
    end_time: "22:00", match_minutes: 20, courts: ["Kremer Baan"], players_private: [{ member_id: "private" }],
    schedule_private: [{ Ronde: 1, Tijd: "20:00 - 20:20", Baan: "Kremer Baan", "Team 1": "Ada & Bea", "Niveau T1": 3, "Team 2": "Cleo & Dora", "Niveau T2": 3, Teamverschil: 0, Rust: "Niemand", "Nog niet aanwezig": "Niemand", "Niet meer beschikbaar": "Niemand" }],
    statistics_private: [], diagnostics: {}, is_published: false, generation_seed: 7,
    planner_draft_revision: 2, created_at: "2026-08-21T10:00:00Z",
  }], error: null });
  const repository = new StaffScheduleRepository({ rpc } as unknown as SupabaseClient);
  const value = await repository.detail(eventId, scheduleId);
  expect(value).toMatchObject({ id: scheduleId, eventId, generationSeed: 7 });
  expect(value).not.toHaveProperty("playersPrivate");
});

it("maps database concurrency and publication denials to finite errors", async () => {
  const conflict = new StaffScheduleRepository({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "40001", message: "private" } }) } as unknown as SupabaseClient);
  await expect(conflict.save({ id: eventId } as never, { revision: 2 } as never, { seed: 7 } as never)).rejects.toBeInstanceOf(StaffScheduleConflictError);
  const denied = new StaffScheduleRepository({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "private" } }) } as unknown as SupabaseClient);
  await expect(denied.setPublished(scheduleId, true)).rejects.toBeInstanceOf(StaffSchedulePublicationError);
});
