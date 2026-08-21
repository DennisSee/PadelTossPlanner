import { NextResponse } from "next/server";

export type AccountNotice = "display-name-updated";
export type AccountError = "invalid-request" | "not-authorized" | "temporarily-unavailable";

const NOTICES: Record<AccountNotice, string> = {
  "display-name-updated": "Je naam is bijgewerkt.",
};
const ERRORS: Record<AccountError, string> = {
  "invalid-request": "Vul een geldige naam in.",
  "not-authorized": "Je naam kan met dit account niet worden gewijzigd.",
  "temporarily-unavailable": "Je naam kon tijdelijk niet worden bijgewerkt.",
};

export function accountRedirect(
  appBaseUrl: string,
  message: Readonly<{ notice?: AccountNotice; error?: AccountError }>,
): NextResponse {
  const url = new URL("/account", appBaseUrl);
  if (message.notice) url.searchParams.set("notice", message.notice);
  if (message.error) url.searchParams.set("error", message.error);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export function accountMessage(notice?: string, error?: string) {
  if (notice && notice in NOTICES) {
    return { tone: "success" as const, text: NOTICES[notice as AccountNotice] };
  }
  if (error && error in ERRORS) {
    return { tone: "danger" as const, text: ERRORS[error as AccountError] };
  }
  return null;
}
