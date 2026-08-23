import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../../lib/auth/finalize";
import { loginPathFor } from "../../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../../lib/config/public-supabase";
import { managementRedirect } from "../../../../../lib/tos/management-request";
import { isUuid } from "../../../../../lib/tos/parser";
import { exactTextFields, hasExactOrigin, noStoreResponse } from "../../../../../lib/tos/request";
import { StaffTosEventRepository } from "../../../../../lib/tos/staff-repository";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let appBaseUrl: string;
  try { appBaseUrl = readAppBaseUrl(); } catch { return noStoreResponse("TOS-eventbeheer is tijdelijk niet beschikbaar.", 503); }
  if (!hasExactOrigin(request, appBaseUrl)) return noStoreResponse("Ongeldig verzoek.", 403);

  let eventId: string;
  try {
    const fields = exactTextFields(await request.formData(), { event_id: 64 });
    if (!isUuid(fields.event_id)) throw new Error();
    eventId = fields.event_id;
  } catch {
    return managementRedirect(appBaseUrl, { error: "invalid-request" });
  }

  try {
    const client = await createServerSupabaseClient();
    const account = await loadAccountContextWithClient(client);
    if (!account) return privateAuthRedirect(loginPathFor("/beheer"), appBaseUrl);
    if (account.profile?.active !== true || !account.capabilities.canAdminister) {
      return privateAuthRedirect("/account", appBaseUrl);
    }
    const repository = new StaffTosEventRepository(client);
    const before = await repository.eventById(eventId);
    if (!before) return managementRedirect(appBaseUrl, { error: "delete-failed" });
    await repository.deleteEvent(before.id);
    if (await repository.eventById(before.id)) {
      return managementRedirect(appBaseUrl, { error: "delete-failed" });
    }
    return managementRedirect(appBaseUrl, { notice: "event-deleted" });
  } catch {
    return managementRedirect(appBaseUrl, { error: "delete-failed" });
  }
}
