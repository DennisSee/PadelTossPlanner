import { NextResponse } from "next/server";

export type HistoryNotice = "contact-requested" | "contact-accepted" | "contact-declined" | "contact-cancelled" | "contact-revoked";
export type HistoryError = "invalid-request" | "not-authorized" | "temporarily-unavailable";

const NOTICES: Record<HistoryNotice, string> = {
  "contact-requested": "Contactverzoek verstuurd.",
  "contact-accepted": "Contactverzoek geaccepteerd.",
  "contact-declined": "Contactverzoek afgewezen.",
  "contact-cancelled": "Contactverzoek ingetrokken.",
  "contact-revoked": "Contacttoestemming ingetrokken.",
};

const ERRORS: Record<HistoryError, string> = {
  "invalid-request": "Dit contactverzoek is niet geldig.",
  "not-authorized": "Je kunt deze contactactie niet uitvoeren.",
  "temporarily-unavailable": "De contactactie is tijdelijk niet beschikbaar.",
};

export function historyRedirect(
  appBaseUrl: string,
  message: Readonly<{ notice?: HistoryNotice; error?: HistoryError }>,
): NextResponse {
  const url = new URL("/historie", appBaseUrl);
  if (message.notice) url.searchParams.set("notice", message.notice);
  if (message.error) url.searchParams.set("error", message.error);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export function historyMessage(notice?: string, error?: string) {
  if (notice && notice in NOTICES) return { tone: "success" as const, text: NOTICES[notice as HistoryNotice] };
  if (error && error in ERRORS) return { tone: "danger" as const, text: ERRORS[error as HistoryError] };
  return null;
}
