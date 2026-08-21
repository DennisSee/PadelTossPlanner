import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../lib/auth/finalize";
import { AccountContextRepository } from "../../../../lib/auth/account-repository";
import { accountRedirect } from "../../../../lib/auth/account-request";
import { loginPathFor } from "../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../lib/config/public-supabase";
import {
  exactTextFields,
  hasExactOrigin,
  normalizedDisplayName,
  noStoreResponse,
} from "../../../../lib/tos/request";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let appBaseUrl: string;
  try {
    appBaseUrl = readAppBaseUrl();
  } catch {
    return noStoreResponse("Accountbeheer is tijdelijk niet beschikbaar.", 503);
  }
  if (!hasExactOrigin(request, appBaseUrl)) {
    return noStoreResponse("Ongeldig verzoek.", 403);
  }

  let displayName: string;
  try {
    const fields = exactTextFields(await request.formData(), { display_name: 120 });
    displayName = normalizedDisplayName(fields.display_name);
  } catch {
    return accountRedirect(appBaseUrl, { error: "invalid-request" });
  }

  try {
    const client = await createServerSupabaseClient();
    const before = await loadAccountContextWithClient(client);
    if (!before) return privateAuthRedirect(loginPathFor("/account"), appBaseUrl);
    if (before.profile?.active !== true || !before.profile.memberId) {
      return accountRedirect(appBaseUrl, { error: "not-authorized" });
    }
    const repository = new AccountContextRepository(client);
    await repository.updateOwnDisplayName(displayName);
    const after = await repository.loadOwn(before.identity);
    if (
      after.profile?.displayName !== displayName ||
      after.membership.displayName !== displayName ||
      after.profile.role !== before.profile.role ||
      after.profile.memberId !== before.profile.memberId
    ) {
      return accountRedirect(appBaseUrl, { error: "temporarily-unavailable" });
    }
    return accountRedirect(appBaseUrl, { notice: "display-name-updated" });
  } catch {
    return accountRedirect(appBaseUrl, { error: "temporarily-unavailable" });
  }
}
