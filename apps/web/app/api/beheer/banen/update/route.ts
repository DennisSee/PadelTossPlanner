import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../../lib/auth/finalize";
import { loginPathFor } from "../../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../../lib/config/public-supabase";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server";
import { CourtRepository } from "../../../../../lib/tos/court-repository";
import { parseUpdateCourt } from "../../../../../lib/tos/court-request";
import { hasExactOrigin, noStoreResponse } from "../../../../../lib/tos/request";

export async function POST(request: NextRequest) {
  let base: string;
  try { base = readAppBaseUrl(); } catch { return noStoreResponse("Tijdelijk niet beschikbaar.", 503); }
  if (!hasExactOrigin(request, base)) return noStoreResponse("Ongeldig verzoek.", 403);
  let input;
  try { input = parseUpdateCourt(await request.formData()); } catch { return noStoreResponse("Ongeldig verzoek.", 400); }
  const client = await createServerSupabaseClient();
  const account = await loadAccountContextWithClient(client);
  if (!account) return privateAuthRedirect(loginPathFor("/beheer/banen"), base);
  if (!account.capabilities.canPlan) return privateAuthRedirect("/account", base);
  try { await new CourtRepository(client).update(input); }
  catch { return privateAuthRedirect("/beheer/banen?error=court-unavailable", base); }
  return privateAuthRedirect("/beheer/banen?notice=court-updated", base);
}
