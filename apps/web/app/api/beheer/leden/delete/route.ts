import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../../lib/auth/finalize";
import { loginPathFor } from "../../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../../lib/config/public-supabase";
import { memberManagementRedirect } from "../../../../../lib/tos/member-management-request";
import { isUuid } from "../../../../../lib/tos/parser";
import { exactTextFields, hasExactOrigin, noStoreResponse } from "../../../../../lib/tos/request";
import {
  StaffMemberActiveParticipationError,
  StaffMemberRepository,
} from "../../../../../lib/tos/staff-member-repository";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let appBaseUrl: string;
  try { appBaseUrl = readAppBaseUrl(); } catch { return noStoreResponse("Ledenbeheer is tijdelijk niet beschikbaar.", 503); }
  if (!hasExactOrigin(request, appBaseUrl)) return noStoreResponse("Ongeldig verzoek.", 403);

  let memberId: string;
  try {
    const fields = exactTextFields(await request.formData(), { member_id: 64 });
    if (!isUuid(fields.member_id)) throw new Error();
    memberId = fields.member_id;
  } catch {
    return memberManagementRedirect(appBaseUrl, { error: "invalid-request" });
  }

  try {
    const client = await createServerSupabaseClient();
    const account = await loadAccountContextWithClient(client);
    if (!account) return privateAuthRedirect(loginPathFor("/beheer/leden"), appBaseUrl);
    if (account.profile?.active !== true || !account.capabilities.canAdminister || account.profile.memberId === memberId) {
      return memberManagementRedirect(appBaseUrl, { error: "not-authorized" });
    }
    const repository = new StaffMemberRepository(client);
    const before = (await repository.list()).find((member) => member.memberId === memberId);
    if (!before) return memberManagementRedirect(appBaseUrl, { error: "delete-failed" });
    await repository.deleteMember(before.memberId);
    if ((await repository.list()).some((member) => member.memberId === before.memberId)) {
      return memberManagementRedirect(appBaseUrl, { error: "delete-failed" });
    }
    return memberManagementRedirect(appBaseUrl, { notice: "member-deleted" });
  } catch (error) {
    if (error instanceof StaffMemberActiveParticipationError) {
      return memberManagementRedirect(appBaseUrl, { error: "active-participation" });
    }
    return memberManagementRedirect(appBaseUrl, { error: "delete-failed" });
  }
}
