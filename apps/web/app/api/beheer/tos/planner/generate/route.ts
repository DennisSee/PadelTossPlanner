import { randomInt } from "node:crypto";
import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../../../lib/auth/finalize";
import { loginPathFor } from "../../../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../../../lib/config/public-supabase";
import { generatePlannerSchedule, PlannerGenerationError, PlannerApiError } from "../../../../../../lib/planner-api/client";
import { plannerCheckpointContext } from "../../../../../../lib/planner-api/checkpoint";
import { PLANNER_TECHNICAL_ERRORS } from "../../../../../../lib/planner-api/errors";
import { serializePlannerGenerationFailure } from "../../../../../../lib/planner-api/failure";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server";
import { PlannerDraftRepository } from "../../../../../../lib/tos/planner-draft-repository";
import { parsePlannerLocatorJson } from "../../../../../../lib/tos/planner-draft-request";
import { plannerGenerateRequest } from "../../../../../../lib/tos/planner-generation";
import { hasExactOrigin, noStoreResponse } from "../../../../../../lib/tos/request";
import { StaffTosEventRepository } from "../../../../../../lib/tos/staff-repository";
import { CourtRepository } from "../../../../../../lib/tos/court-repository";

export const dynamic = "force-dynamic";

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function POST(request: NextRequest) {
  let appBaseUrl: string;
  try { appBaseUrl = readAppBaseUrl(); } catch { return noStoreResponse("Planner tijdelijk niet beschikbaar.", 503); }
  if (!hasExactOrigin(request, appBaseUrl)) return noStoreResponse("Ongeldig verzoek.", 403);
  let parsed;
  try { parsed = parsePlannerLocatorJson(await request.json()); }
  catch { return jsonError("invalid-request", 400); }
  try {
    const client = await createServerSupabaseClient();
    const account = await loadAccountContextWithClient(client);
    if (!account) return privateAuthRedirect(loginPathFor("/beheer"), appBaseUrl);
    if (!account.capabilities.canPlan) return privateAuthRedirect("/account", appBaseUrl);
    const event = await new StaffTosEventRepository(client).eventBySlug(parsed.slug);
    if (!event) return jsonError("not-authorized", 403);
    const draft = await new PlannerDraftRepository(client).load(event);
    if (draft.revision !== parsed.expectedRevision) return jsonError("conflict", 409);
    const courts = await new CourtRepository(client).list(event.sport);
    const seed = randomInt(0, 2_147_483_647);
    const generated = await generatePlannerSchedule({ ...plannerGenerateRequest(event, draft, seed, courts),
      checkpoint_context: plannerCheckpointContext(event, draft, courts) });
    if (!generated.checkpoint) throw new PlannerApiError("MALFORMED_RESPONSE");
    return Response.json(generated, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof PlannerGenerationError) {
      return Response.json(
        { error: "generation-failed", failure: serializePlannerGenerationFailure(error.failure) },
        { status: 422, headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
    }
    const code = error instanceof PlannerApiError ? error.code : "PLANNER_INTERNAL_ERROR";
    return jsonError(code, PLANNER_TECHNICAL_ERRORS[code].status);
  }
}
