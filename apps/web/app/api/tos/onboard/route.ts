import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../lib/auth/finalize";
import { loginPathFor, type SafeReturnPath } from "../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../lib/config/public-supabase";
import { TosRepository } from "../../../../lib/tos/repository";
import {
  exactTextFields,
  hasExactOrigin,
  InvalidTosRequestError,
  normalizedDisplayName,
  noStoreResponse,
  tosRedirect,
} from "../../../../lib/tos/request";
import { isTosEventSlug, tosDetailPath } from "../../../../lib/tos/slug";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let appBaseUrl: string;
  try {
    appBaseUrl = readAppBaseUrl();
  } catch {
    return noStoreResponse("Clubprofiel tijdelijk niet beschikbaar.", 503);
  }
  if (!hasExactOrigin(request, appBaseUrl)) {
    return noStoreResponse("Ongeldig verzoek.", 403);
  }

  let destination: SafeReturnPath = "/tos";
  let displayName: string;
  try {
    const values = exactTextFields(
      await request.formData(),
      { display_name: 120 },
      { slug: 80 },
    );
    displayName = normalizedDisplayName(values.display_name);
    if (values.slug !== undefined) {
      if (!isTosEventSlug(values.slug)) throw new InvalidTosRequestError();
      destination = tosDetailPath(values.slug);
    }
  } catch {
    return tosRedirect(appBaseUrl, "/tos", { error: "invalid-request" });
  }

  try {
    const client = await createServerSupabaseClient();
    const account = await loadAccountContextWithClient(client);
    if (!account) return privateAuthRedirect(loginPathFor(destination), appBaseUrl);
    if (
      account.profile?.active !== true ||
      account.membership.state !== "missing"
    ) {
      return tosRedirect(appBaseUrl, destination, { error: "not-authorized" });
    }
    await new TosRepository(client).selfOnboard(displayName);
    const refreshed = await loadAccountContextWithClient(client);
    if (
      !refreshed ||
      !new Set(["approved", "pending"]).has(refreshed.membership.state) ||
      refreshed.profile?.role !== account.profile.role
    ) {
      return tosRedirect(appBaseUrl, destination, { error: "temporarily-unavailable" });
    }
    return tosRedirect(appBaseUrl, destination, { notice: "profile-created" });
  } catch {
    return tosRedirect(appBaseUrl, destination, { error: "temporarily-unavailable" });
  }
}
