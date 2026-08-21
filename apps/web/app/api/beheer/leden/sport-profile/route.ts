import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../../lib/auth/finalize";
import { loginPathFor } from "../../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../../lib/config/public-supabase";
import { validateSportProfileWrite } from "../../../../../lib/tos/member-management";
import { memberManagementRedirect } from "../../../../../lib/tos/member-management-request";
import { exactTextFields, hasExactOrigin, noStoreResponse } from "../../../../../lib/tos/request";
import { StaffMemberRepository } from "../../../../../lib/tos/staff-member-repository";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let appBaseUrl: string;
  try {
    appBaseUrl = readAppBaseUrl();
  } catch {
    return noStoreResponse("Ledenbeheer is tijdelijk niet beschikbaar.", 503);
  }
  if (!hasExactOrigin(request, appBaseUrl)) {
    return noStoreResponse("Ongeldig verzoek.", 403);
  }

  let write;
  try {
    const fields = exactTextFields(await request.formData(), {
      member_id: 64,
      sport: 16,
      active: 5,
      ranking: 1,
    });
    write = validateSportProfileWrite({
      memberId: fields.member_id,
      sport: fields.sport,
      active: fields.active,
      ranking: fields.ranking,
    });
  } catch {
    return memberManagementRedirect(appBaseUrl, { error: "invalid-request" });
  }

  try {
    const client = await createServerSupabaseClient();
    const account = await loadAccountContextWithClient(client);
    if (!account) return privateAuthRedirect(loginPathFor("/beheer/leden"), appBaseUrl);
    if (account.profile?.active !== true || !account.capabilities.canPlan) {
      return memberManagementRedirect(appBaseUrl, { error: "not-authorized" });
    }
    const stored = await new StaffMemberRepository(client).updateSportProfile(write);
    if (
      stored.memberId !== write.memberId ||
      stored.sport !== write.sport ||
      stored.active !== write.active ||
      stored.ranking !== write.ranking
    ) {
      return memberManagementRedirect(appBaseUrl, { error: "temporarily-unavailable" });
    }
    return memberManagementRedirect(appBaseUrl, { notice: "sport-profile-updated" });
  } catch {
    return memberManagementRedirect(appBaseUrl, { error: "temporarily-unavailable" });
  }
}
