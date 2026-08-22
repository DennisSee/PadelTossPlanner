import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../lib/auth/finalize";
import { loginPathFor } from "../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../lib/config/public-supabase";
import { HistoryRepository } from "../../../../lib/history/repository";
import { historyRedirect, type HistoryNotice } from "../../../../lib/history/messages";
import { parseHistoryContactAction } from "../../../../lib/history/request";
import { hasExactOrigin, noStoreResponse } from "../../../../lib/tos/request";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let appBaseUrl: string;
  try {
    appBaseUrl = readAppBaseUrl();
  } catch {
    return noStoreResponse("Contacten zijn tijdelijk niet beschikbaar.", 503);
  }
  if (!hasExactOrigin(request, appBaseUrl)) return noStoreResponse("Ongeldig verzoek.", 403);

  let action;
  try {
    action = parseHistoryContactAction(await request.formData());
  } catch {
    return historyRedirect(appBaseUrl, { error: "invalid-request" });
  }

  try {
    const client = await createServerSupabaseClient();
    const account = await loadAccountContextWithClient(client);
    if (!account) return privateAuthRedirect(loginPathFor("/historie"), appBaseUrl);
    if (!account.capabilities.canParticipate) return historyRedirect(appBaseUrl, { error: "not-authorized" });
    const repository = new HistoryRepository(client);
    let notice: HistoryNotice;
    switch (action.action) {
      case "request":
        await repository.requestContact(action.otherMemberId);
        notice = "contact-requested";
        break;
      case "accept":
        await repository.respondContact(action.requestId, true);
        notice = "contact-accepted";
        break;
      case "decline":
        await repository.respondContact(action.requestId, false);
        notice = "contact-declined";
        break;
      case "cancel":
        await repository.cancelContact(action.requestId);
        notice = "contact-cancelled";
        break;
      case "revoke":
        await repository.revokeContact(action.requestId);
        notice = "contact-revoked";
        break;
    }
    return historyRedirect(appBaseUrl, { notice });
  } catch {
    return historyRedirect(appBaseUrl, { error: "temporarily-unavailable" });
  }
}
