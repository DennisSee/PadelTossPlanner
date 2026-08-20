import { NextResponse } from "next/server";

export type ManagementNotice = "event-created" | "event-updated";
export type ManagementErrorCode =
  | "invalid-request"
  | "not-authorized"
  | "conflict"
  | "temporarily-unavailable";

const NOTICE_TEXT: Record<ManagementNotice, string> = {
  "event-created": "De TOS-avond is aangemaakt.",
  "event-updated": "De TOS-avond is bijgewerkt.",
};
const ERROR_TEXT: Record<ManagementErrorCode, string> = {
  "invalid-request": "Controleer de ingevulde eventgegevens.",
  "not-authorized": "Je hebt geen toegang tot eventbeheer.",
  conflict: "De TOS-avond kon door een conflict niet worden opgeslagen.",
  "temporarily-unavailable": "TOS-eventbeheer is tijdelijk niet beschikbaar.",
};

export function managementRedirect(
  appBaseUrl: string,
  message: Readonly<{ notice?: ManagementNotice; error?: ManagementErrorCode }>,
): NextResponse {
  const url = new URL("/beheer", appBaseUrl);
  if (message.notice) url.searchParams.set("notice", message.notice);
  if (message.error) url.searchParams.set("error", message.error);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export function managementMessage(
  notice: string | undefined,
  error: string | undefined,
): Readonly<{ tone: "success" | "danger"; text: string }> | null {
  if (notice && notice in NOTICE_TEXT) {
    return { tone: "success", text: NOTICE_TEXT[notice as ManagementNotice] };
  }
  if (error && error in ERROR_TEXT) {
    return { tone: "danger", text: ERROR_TEXT[error as ManagementErrorCode] };
  }
  return null;
}
