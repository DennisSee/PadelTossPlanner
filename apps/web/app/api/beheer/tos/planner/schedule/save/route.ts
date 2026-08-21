import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../../../../lib/auth/finalize";
import { loginPathFor } from "../../../../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../../../../lib/config/public-supabase";
import { generatePlannerSchedule, PlannerApiError } from "../../../../../../../lib/planner-api/client";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server";
import { PlannerDraftRepository } from "../../../../../../../lib/tos/planner-draft-repository";
import { parseScheduleSaveRequest } from "../../../../../../../lib/tos/planner-draft-request";
import { InvalidPlannerGenerationError, plannerGenerateRequest } from "../../../../../../../lib/tos/planner-generation";
import { plannerRedirect } from "../../../../../../../lib/tos/planner-management-request";
import { hasExactOrigin, noStoreResponse } from "../../../../../../../lib/tos/request";
import { StaffScheduleConflictError, StaffScheduleDataError, StaffScheduleRepository } from "../../../../../../../lib/tos/schedule-repository";
import { StaffTosEventRepository } from "../../../../../../../lib/tos/staff-repository";
import { formatEventClock } from "../../../../../../../lib/tos/time";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let appBaseUrl: string;
  try { appBaseUrl = readAppBaseUrl(); } catch { return noStoreResponse("Planner tijdelijk niet beschikbaar.", 503); }
  if (!hasExactOrigin(request, appBaseUrl)) return noStoreResponse("Ongeldig verzoek.", 403);
  let parsed;
  try { parsed = parseScheduleSaveRequest(await request.formData()); }
  catch { return noStoreResponse("Ongeldig verzoek.", 400); }
  try {
    const client = await createServerSupabaseClient();
    const account = await loadAccountContextWithClient(client);
    if (!account) return privateAuthRedirect(loginPathFor("/beheer"), appBaseUrl);
    if (!account.capabilities.canPlan) return privateAuthRedirect("/account", appBaseUrl);
    const event = await new StaffTosEventRepository(client).eventBySlug(parsed.slug);
    if (!event || event.sport !== "padel") return plannerRedirect(appBaseUrl, parsed.slug, { error: "not-authorized" });
    const draft = await new PlannerDraftRepository(client).load(event);
    if (draft.revision !== parsed.expectedRevision) return plannerRedirect(appBaseUrl, parsed.slug, { error: "conflict" });
    const generated = await generatePlannerSchedule(plannerGenerateRequest(event, draft, parsed.generationSeed));
    const repository = new StaffScheduleRepository(client);
    const scheduleId = await repository.save(event, draft, generated);
    const stored = await repository.detail(event.id, scheduleId);
    if (!stored || stored.eventId !== event.id || stored.generationSeed !== generated.seed ||
        stored.plannerDraftRevision !== draft.revision || stored.title !== event.title ||
        stored.startTime !== formatEventClock(event.startsAt) || stored.endTime !== formatEventClock(event.endsAt) ||
        stored.matchMinutes !== draft.matchMinutes || JSON.stringify(stored.courts) !== JSON.stringify(draft.selectedCourts) ||
        JSON.stringify(stored.schedule) !== JSON.stringify(generated.schedule) ||
        JSON.stringify(stored.statistics) !== JSON.stringify(generated.statistics) ||
        JSON.stringify(stored.diagnostics) !== JSON.stringify(generated.diagnostics)) {
      return plannerRedirect(appBaseUrl, parsed.slug, { error: "temporarily-unavailable" });
    }
    return plannerRedirect(appBaseUrl, parsed.slug, { notice: "schedule-saved" });
  } catch (error) {
    if (error instanceof StaffScheduleConflictError) return plannerRedirect(appBaseUrl, parsed.slug, { error: "conflict" });
    if (error instanceof InvalidPlannerGenerationError) return plannerRedirect(appBaseUrl, parsed.slug, { error: "planner-input-invalid" });
    if (error instanceof PlannerApiError) return plannerRedirect(appBaseUrl, parsed.slug, { error: "planner-unavailable" });
    if (error instanceof StaffScheduleDataError) return plannerRedirect(appBaseUrl, parsed.slug, { error: "schedule-unavailable" });
    return plannerRedirect(appBaseUrl, parsed.slug, { error: "temporarily-unavailable" });
  }
}
