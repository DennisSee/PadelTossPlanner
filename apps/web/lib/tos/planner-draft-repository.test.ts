import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";

import { emptyPlannerDraft } from "./planner-draft";
import { PlannerDraftConflictError, PlannerDraftRepository } from "./planner-draft-repository";
import type { TosEvent } from "./types";

const event: TosEvent = { id: "11111111-1111-4111-8111-111111111111", slug: "planner-padel", title: "Planner", sport: "padel", startsAt: "2026-08-21T18:00:00Z", endsAt: "2026-08-21T20:00:00Z", signupDeadline: null, status: "closed" };

it("uses only the two event-scoped RPCs and returns explicit defaults for no row", async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: 1, error: null });
  const repository = new PlannerDraftRepository({ rpc } as unknown as SupabaseClient);
  const draft = await repository.load(event);
  expect(draft).toEqual(emptyPlannerDraft(event));
  await expect(repository.save(event, 0, {
    players: [], selectedCourts: ["Kremer Baan"], matchMinutes: 20, restMinutes: 0,
    searchProfile: "Normaal", allowRepeatPartners: false, levelMix: 50, teamDifferenceTolerance: 0.5,
  })).resolves.toBe(1);
  expect(rpc.mock.calls[0]).toEqual(["staff_event_planner_draft", { p_event_id: event.id }]);
  expect(rpc.mock.calls[1][0]).toBe("staff_save_event_planner_draft");
  expect(JSON.stringify(rpc.mock.calls[1][1])).not.toMatch(/service.role|secret/iu);
});

it("maps only SQLSTATE 40001 to the finite conflict", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "40001", message: "private detail" } });
  await expect(new PlannerDraftRepository({ rpc } as unknown as SupabaseClient).save(event, 1, {
    players: [], selectedCourts: ["Kremer Baan"], matchMinutes: 20, restMinutes: 0,
    searchProfile: "Normaal", allowRepeatPartners: false, levelMix: 50, teamDifferenceTolerance: 0.5,
  })).rejects.toEqual(new PlannerDraftConflictError());
});
