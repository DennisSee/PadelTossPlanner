import "server-only";

import { NextResponse } from "next/server";

import { loginPathFor, type SafeReturnPath } from "./return-path";
import { destinationForAccount, loadCurrentAccountContext } from "./session";

export function privateAuthRedirect(path: string, appBaseUrl: string) {
  const response = NextResponse.redirect(new URL(path, appBaseUrl), 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export function authConfigurationUnavailable() {
  return new Response("Inloggen is tijdelijk niet beschikbaar.", {
    status: 503,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function finalizeAuthenticatedRequest(
  next: SafeReturnPath,
  appBaseUrl: string,
  failurePath = loginPathFor(next),
) {
  try {
    const account = await loadCurrentAccountContext();
    if (!account) return privateAuthRedirect(failurePath, appBaseUrl);
    return privateAuthRedirect(destinationForAccount(next, account), appBaseUrl);
  } catch {
    return privateAuthRedirect(failurePath, appBaseUrl);
  }
}
