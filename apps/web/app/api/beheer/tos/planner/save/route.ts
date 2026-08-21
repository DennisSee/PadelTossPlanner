import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../../../lib/auth/finalize";
import { loginPathFor } from "../../../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../../../lib/config/public-supabase";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server";
import { plannerDraftMatchesWrite, reconcileEditableDraft } from "../../../../../../lib/tos/planner-draft";
import {
  PlannerDraftConflictError,
  PlannerDraftRepository,
} from "../../../../../../lib/tos/planner-draft-repository";
import { parsePlannerDraftSaveRequest } from "../../../../../../lib/tos/planner-draft-request";
import { plannerRedirect } from "../../../../../../lib/tos/planner-management-request";
import { hasExactOrigin, noStoreResponse } from "../../../../../../lib/tos/request";
import { StaffTosEventRepository } from "../../../../../../lib/tos/staff-repository";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let appBaseUrl: string;
  try { appBaseUrl = readAppBaseUrl(); } catch { return noStoreResponse("Planner tijdelijk niet beschikbaar.", 503); }
  if (!hasExactOrigin(request, appBaseUrl)) return noStoreResponse("Ongeldig verzoek.", 403);
  let parsed;
  try { parsed = parsePlannerDraftSaveRequest(await request.formData()); }
  catch { return noStoreResponse("Ongeldig verzoek.", 400); }

  try {
    const client = await createServerSupabaseClient();
    const account = await loadAccountContextWithClient(client);
    if (!account) return privateAuthRedirect(loginPathFor("/beheer"), appBaseUrl);
    if (!account.capabilities.canPlan) return privateAuthRedirect("/account", appBaseUrl);
    const event = await new StaffTosEventRepository(client).eventBySlug(parsed.slug);
    if (!event || event.sport !== "padel") return plannerRedirect(appBaseUrl, parsed.slug, { error: "not-authorized" });
    const repository = new PlannerDraftRepository(client);
    const current = await repository.load(event);
    if (current.revision !== parsed.expectedRevision) throw new PlannerDraftConflictError();
    const write = reconcileEditableDraft(event, current, parsed.players, parsed.settings, randomUUID);
    const revision = await repository.save(event, current.revision, write);
    const stored = await repository.load(event);
    if (!plannerDraftMatchesWrite(stored, write, revision)) return plannerRedirect(appBaseUrl, parsed.slug, { error: "temporarily-unavailable" });
    return plannerRedirect(appBaseUrl, parsed.slug, { notice: "draft-saved" });
  } catch (error) {
    if (error instanceof PlannerDraftConflictError) return plannerRedirect(appBaseUrl, parsed.slug, { error: "conflict" });
    return plannerRedirect(appBaseUrl, parsed.slug, { error: "invalid-request" });
  }
}
