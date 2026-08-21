import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../../../../lib/auth/finalize";
import { loginPathFor } from "../../../../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../../../../lib/config/public-supabase";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server";
import { parseSchedulePublishRequest } from "../../../../../../../lib/tos/planner-draft-request";
import { plannerRedirect } from "../../../../../../../lib/tos/planner-management-request";
import { hasExactOrigin, noStoreResponse } from "../../../../../../../lib/tos/request";
import { StaffScheduleDataError, StaffSchedulePublicationError, StaffScheduleRepository } from "../../../../../../../lib/tos/schedule-repository";
import { StaffTosEventRepository } from "../../../../../../../lib/tos/staff-repository";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let appBaseUrl: string;
  try { appBaseUrl = readAppBaseUrl(); } catch { return noStoreResponse("Planner tijdelijk niet beschikbaar.", 503); }
  if (!hasExactOrigin(request, appBaseUrl)) return noStoreResponse("Ongeldig verzoek.", 403);
  let parsed;
  try { parsed = parseSchedulePublishRequest(await request.formData()); }
  catch { return noStoreResponse("Ongeldig verzoek.", 400); }
  try {
    const client = await createServerSupabaseClient();
    const account = await loadAccountContextWithClient(client);
    if (!account) return privateAuthRedirect(loginPathFor("/beheer"), appBaseUrl);
    if (!account.capabilities.canPlan) return privateAuthRedirect("/account", appBaseUrl);
    const event = await new StaffTosEventRepository(client).eventBySlug(parsed.slug);
    if (!event) return plannerRedirect(appBaseUrl, parsed.slug, { error: "not-authorized" });
    const repository = new StaffScheduleRepository(client);
    const before = await repository.detail(event.id, parsed.scheduleId);
    if (!before) return plannerRedirect(appBaseUrl, parsed.slug, { error: "not-authorized" });
    await repository.setPublished(parsed.scheduleId, parsed.published);
    const after = await repository.detail(event.id, parsed.scheduleId);
    if (!after || after.isPublished !== parsed.published) return plannerRedirect(appBaseUrl, parsed.slug, { error: "temporarily-unavailable" });
    return plannerRedirect(appBaseUrl, parsed.slug, { notice: parsed.published ? "schedule-published" : "schedule-unpublished" });
  } catch (error) {
    if (error instanceof StaffSchedulePublicationError) return plannerRedirect(appBaseUrl, parsed.slug, { error: "publication-forbidden" });
    if (error instanceof StaffScheduleDataError) return plannerRedirect(appBaseUrl, parsed.slug, { error: "schedule-unavailable" });
    return plannerRedirect(appBaseUrl, parsed.slug, { error: "not-authorized" });
  }
}
