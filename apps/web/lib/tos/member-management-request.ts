import { NextResponse } from "next/server";

export type MemberNotice = "sport-profile-updated" | "account-role-updated" | "member-deleted";
export type MemberError = "invalid-request" | "not-authorized" | "active-participation" | "delete-failed" | "temporarily-unavailable";

const NOTICES: Record<MemberNotice, string> = {
  "sport-profile-updated": "Het sportprofiel is bijgewerkt.",
  "account-role-updated": "De accountrol is bijgewerkt.",
  "member-deleted": "Het lid en het gekoppelde account zijn verwijderd.",
};
const ERRORS: Record<MemberError, string> = {
  "invalid-request": "Controleer het sportprofiel.",
  "not-authorized": "Je hebt geen toegang tot ledenbeheer.",
  "active-participation": "Dit lid kan niet worden verwijderd zolang er nog een actieve of toekomstige TOS-deelname is.",
  "delete-failed": "Het lid kon niet veilig worden verwijderd.",
  "temporarily-unavailable": "Het sportprofiel kon tijdelijk niet worden bijgewerkt.",
};

export function memberManagementRedirect(
  appBaseUrl: string,
  message: Readonly<{ notice?: MemberNotice; error?: MemberError }>,
): NextResponse {
  const url = new URL("/beheer/leden", appBaseUrl);
  if (message.notice) url.searchParams.set("notice", message.notice);
  if (message.error) url.searchParams.set("error", message.error);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export function memberManagementMessage(notice?: string, error?: string) {
  if (notice && notice in NOTICES) {
    return { tone: "success" as const, text: NOTICES[notice as MemberNotice] };
  }
  if (error && error in ERRORS) {
    return { tone: "danger" as const, text: ERRORS[error as MemberError] };
  }
  return null;
}
