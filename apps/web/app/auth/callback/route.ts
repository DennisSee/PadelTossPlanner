import type { NextRequest } from "next/server";

import {
  authConfigurationUnavailable,
  finalizeAuthenticatedRequest,
  privateAuthRedirect,
} from "../../../lib/auth/finalize";
import {
  isPlausibleOAuthCode,
  isPlausiblePkceFlowId,
  oauthFailurePath,
} from "../../../lib/auth/oauth";
import { sanitizeReturnPath } from "../../../lib/auth/return-path";
import { readAppBaseUrl } from "../../../lib/config/public-supabase";
import { createServerSupabaseClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let appBaseUrl: string;
  try {
    appBaseUrl = readAppBaseUrl();
  } catch {
    return authConfigurationUnavailable();
  }

  const next = sanitizeReturnPath(request.nextUrl.searchParams.get("next"));
  const failurePath = oauthFailurePath(next);
  const code = request.nextUrl.searchParams.get("code");
  const flowId = request.nextUrl.searchParams.get("sb_flow_id");
  if (
    request.nextUrl.searchParams.has("error") ||
    !isPlausibleOAuthCode(code) ||
    !isPlausiblePkceFlowId(flowId)
  ) {
    return privateAuthRedirect(failurePath, appBaseUrl);
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code, {
      flowId,
    });
    if (error) return privateAuthRedirect(failurePath, appBaseUrl);
    return finalizeAuthenticatedRequest(next, appBaseUrl, failurePath);
  } catch {
    return privateAuthRedirect(failurePath, appBaseUrl);
  }
}
