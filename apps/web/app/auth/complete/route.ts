import { NextResponse, type NextRequest } from "next/server";

import { loginPathFor, sanitizeReturnPath } from "../../../lib/auth/return-path";
import {
  destinationForAccount,
  loadCurrentAccountContext,
} from "../../../lib/auth/session";
import { readAppBaseUrl } from "../../../lib/config/public-supabase";

export const dynamic = "force-dynamic";

function privateRedirect(path: string, appBaseUrl: string) {
  const response = NextResponse.redirect(new URL(path, appBaseUrl), 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

function configurationUnavailable() {
  return new Response("Inloggen is tijdelijk niet beschikbaar.", {
    status: 503,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function GET(request: NextRequest) {
  let appBaseUrl: string;
  try {
    appBaseUrl = readAppBaseUrl();
  } catch {
    return configurationUnavailable();
  }
  const next = sanitizeReturnPath(request.nextUrl.searchParams.get("next"));
  try {
    const account = await loadCurrentAccountContext();
    if (!account) return privateRedirect(loginPathFor(next), appBaseUrl);
    return privateRedirect(destinationForAccount(next, account), appBaseUrl);
  } catch {
    return privateRedirect(loginPathFor(next), appBaseUrl);
  }
}
