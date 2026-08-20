import type { NextRequest } from "next/server";

import {
  authConfigurationUnavailable,
  finalizeAuthenticatedRequest,
} from "../../../lib/auth/finalize";
import { sanitizeReturnPath } from "../../../lib/auth/return-path";
import { readAppBaseUrl } from "../../../lib/config/public-supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let appBaseUrl: string;
  try {
    appBaseUrl = readAppBaseUrl();
  } catch {
    return authConfigurationUnavailable();
  }
  const next = sanitizeReturnPath(request.nextUrl.searchParams.get("next"));
  return finalizeAuthenticatedRequest(next, appBaseUrl);
}
