import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../../../lib/auth/finalize";
import { loginPathFor } from "../../../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../../../lib/config/public-supabase";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server";
import { importRegistrations, plannerDraftMatchesWrite, plannerDraftPlayersMatch } from "../../../../../../lib/tos/planner-draft";
import { PlannerDraftConflictError, PlannerDraftRepository } from "../../../../../../lib/tos/planner-draft-repository";
import { parsePlannerLocatorRequest } from "../../../../../../lib/tos/planner-draft-request";
import { plannerRedirect } from "../../../../../../lib/tos/planner-management-request";
import { hasExactOrigin, noStoreResponse } from "../../../../../../lib/tos/request";
import { StaffPlannerInputRepository } from "../../../../../../lib/tos/staff-planner-input-repository";
import { StaffRegistrationOverviewRepository } from "../../../../../../lib/tos/staff-registration-overview-repository";
import { StaffScheduleRepository } from "../../../../../../lib/tos/schedule-repository";
import { StaffTosEventRepository } from "../../../../../../lib/tos/staff-repository";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let appBaseUrl: string;
  try { appBaseUrl = readAppBaseUrl(); } catch { return noStoreResponse("Planner tijdelijk niet beschikbaar.", 503); }
  if (!hasExactOrigin(request, appBaseUrl)) return noStoreResponse("Ongeldig verzoek.", 403);
  let parsed;
  try { parsed = parsePlannerLocatorRequest(await request.formData()); }
  catch { return noStoreResponse("Ongeldig verzoek.", 400); }
  try {
    const client = await createServerSupabaseClient();
    const account = await loadAccountContextWithClient(client);
    if (!account) return privateAuthRedirect(loginPathFor("/beheer"), appBaseUrl);
    if (!account.capabilities.canPlan) return privateAuthRedirect("/account", appBaseUrl);
    const event = await new StaffTosEventRepository(client).eventBySlug(parsed.slug);
    if (!event) return plannerRedirect(appBaseUrl, parsed.slug, { error: "not-authorized" });
    const draftRepository = new PlannerDraftRepository(client);
    const current = await draftRepository.load(event);
    if (current.revision !== parsed.expectedRevision) throw new PlannerDraftConflictError();
    const [registrations, overview, schedules] = await Promise.all([
      new StaffPlannerInputRepository(client).plannerInputForEvent(event.id),
      new StaffRegistrationOverviewRepository(client).forEvent(event.id),
      new StaffScheduleRepository(client).list(event.id),
    ]);
    const imported = importRegistrations(event, current, registrations, overview, randomUUID);
    const write = {
      players: imported.players,
      selectedCourts: current.selectedCourts,
      matchMinutes: current.matchMinutes,
      restMinutes: current.restMinutes,
      searchProfile: current.searchProfile,
      allowRepeatPartners: current.allowRepeatPartners,
      levelMix: current.levelMix,
      teamDifferenceTolerance: current.teamDifferenceTolerance,
    } as const;
    if (plannerDraftPlayersMatch(current, imported.players)) {
      return plannerRedirect(appBaseUrl, parsed.slug, { notice: "registrations-current" });
    }
    const revision = await draftRepository.save(event, current.revision, write);
    const stored = await draftRepository.load(event);
    if (!plannerDraftMatchesWrite(stored, write, revision)) {
      return plannerRedirect(appBaseUrl, parsed.slug, { error: "temporarily-unavailable" });
    }
    return plannerRedirect(appBaseUrl, parsed.slug, {
      notice: schedules.some((schedule) => schedule.isPublished)
        ? "registrations-imported-regenerate"
        : "registrations-imported",
    });
  } catch (error) {
    if (error instanceof PlannerDraftConflictError) return plannerRedirect(appBaseUrl, parsed.slug, { error: "conflict" });
    return plannerRedirect(appBaseUrl, parsed.slug, { error: "temporarily-unavailable" });
  }
}
