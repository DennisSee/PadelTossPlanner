import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../../lib/auth/finalize";
import { loginPathFor } from "../../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../../lib/config/public-supabase";
import { memberManagementRedirect } from "../../../../../lib/tos/member-management-request";
import { isUuid } from "../../../../../lib/tos/parser";
import { exactTextFields, hasExactOrigin, noStoreResponse } from "../../../../../lib/tos/request";
import { StaffMemberRepository } from "../../../../../lib/tos/staff-member-repository";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let appBaseUrl: string;
  try { appBaseUrl = readAppBaseUrl(); } catch { return noStoreResponse("Ledenbeheer is tijdelijk niet beschikbaar.", 503); }
  if (!hasExactOrigin(request, appBaseUrl)) return noStoreResponse("Ongeldig verzoek.", 403);
  let profileId: string;
  let role: "participant" | "planner" | "admin";
  try {
    const fields = exactTextFields(await request.formData(), { profile_id: 64, role: 16 });
    if (!isUuid(fields.profile_id) || !["participant", "planner", "admin"].includes(fields.role)) throw new Error();
    profileId = fields.profile_id;
    role = fields.role as typeof role;
  } catch { return memberManagementRedirect(appBaseUrl, { error: "invalid-request" }); }
  try {
    const client = await createServerSupabaseClient();
    const account = await loadAccountContextWithClient(client);
    if (!account) return privateAuthRedirect(loginPathFor("/beheer/leden"), appBaseUrl);
    if (account.profile?.active !== true || !account.capabilities.canAdminister || account.identity.userId === profileId) {
      return memberManagementRedirect(appBaseUrl, { error: "not-authorized" });
    }
    const repository = new StaffMemberRepository(client);
    const stored = await repository.updateRole({ profileId, role });
    if (stored.profileId !== profileId || stored.role !== role) return memberManagementRedirect(appBaseUrl, { error: "temporarily-unavailable" });
    return memberManagementRedirect(appBaseUrl, { notice: "account-role-updated" });
  } catch { return memberManagementRedirect(appBaseUrl, { error: "temporarily-unavailable" }); }
}
