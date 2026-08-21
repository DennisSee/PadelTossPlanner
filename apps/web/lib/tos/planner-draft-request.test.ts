import { describe, expect, it } from "vitest";
import {
  parsePlannerDraftSaveRequest,
  parsePlannerLocatorJson,
  parseSchedulePublishRequest,
  parseScheduleSaveRequest,
} from "./planner-draft-request";

function draftForm(): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    slug: "planner-padel", expected_revision: "1",
    players: JSON.stringify([{ rowId: "", name: "Handmatig", ranking: 3, included: true, availableFrom: "20:07", availableUntil: "22:00" }]),
    selected_courts: JSON.stringify(["Kremer Baan"]), match_minutes: "20", rest_minutes: "0",
    search_profile: "Normaal", allow_repeat_partners: "false", level_mix: "50",
    team_difference_tolerance: "0.5",
  })) form.set(key, value);
  return form;
}

describe("planner mutation request contracts", () => {
  it("accepts exact minute-precision draft fields", () => {
    expect(parsePlannerDraftSaveRequest(draftForm())).toMatchObject({ slug: "planner-padel", expectedRevision: 1 });
  });

  it("rejects unknown, duplicate and authority fields", () => {
    for (const forbidden of ["event_id", "user_id", "member_id", "registration_id", "source", "created_by"]) {
      const form = draftForm(); form.set(forbidden, "forged");
      expect(() => parsePlannerDraftSaveRequest(form)).toThrow();
    }
    const duplicate = draftForm(); duplicate.append("slug", "other");
    expect(() => parsePlannerDraftSaveRequest(duplicate)).toThrow();
  });

  it("accepts only slug and revision for generation", () => {
    expect(parsePlannerLocatorJson({ slug: "planner-padel", expected_revision: 2 })).toEqual({ slug: "planner-padel", expectedRevision: 2 });
    expect(() => parsePlannerLocatorJson({ slug: "planner-padel", expected_revision: 2, seed: 7 })).toThrow();
  });

  it("keeps save and publication browser payloads minimal", () => {
    const save = new FormData(); save.set("slug", "planner-padel"); save.set("expected_revision", "2"); save.set("generation_seed", "7");
    expect(parseScheduleSaveRequest(save)).toEqual({ slug: "planner-padel", expectedRevision: 2, generationSeed: 7 });
    const publish = new FormData(); publish.set("slug", "planner-padel"); publish.set("schedule_id", "11111111-1111-4111-8111-111111111111"); publish.set("published", "true");
    expect(parseSchedulePublishRequest(publish)).toEqual({ slug: "planner-padel", scheduleId: "11111111-1111-4111-8111-111111111111", published: true });
  });
});
