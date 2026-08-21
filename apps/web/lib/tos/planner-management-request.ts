import { NextResponse } from "next/server";

import { isTosEventSlug } from "./slug";

export type PlannerNotice =
  | "draft-saved"
  | "registrations-imported"
  | "schedule-saved"
  | "schedule-published"
  | "schedule-unpublished";
export type PlannerError =
  | "invalid-request"
  | "not-authorized"
  | "conflict"
  | "planner-input-invalid"
  | "planner-unavailable"
  | "schedule-unavailable"
  | "publication-forbidden"
  | "temporarily-unavailable"
  | "generation-failed";

const NOTICES: Record<PlannerNotice, string> = {
  "draft-saved": "Planneropzet opgeslagen.",
  "registrations-imported": "Geldige aanmeldingen zijn in de planneropzet verwerkt.",
  "schedule-saved": "Schema privé opgeslagen.",
  "schedule-published": "Schema gepubliceerd.",
  "schedule-unpublished": "Publicatie ingetrokken.",
};
const ERRORS: Record<PlannerError, string> = {
  "invalid-request": "Controleer de plannerinvoer.",
  "not-authorized": "Je hebt geen toegang tot deze planner.",
  conflict: "De planneropzet is intussen gewijzigd. Herlaad de pagina.",
  "planner-input-invalid": "Controleer de spelers, beschikbaarheid, banen en plannerinstellingen.",
  "planner-unavailable": "De plannergenerator is tijdelijk niet beschikbaar.",
  "schedule-unavailable": "Het schema is tijdelijk niet beschikbaar.",
  "publication-forbidden": "Je mag dit schema niet publiceren.",
  "temporarily-unavailable": "De planner is tijdelijk niet beschikbaar.",
  "generation-failed": "Er kon met deze opzet geen geldig schema worden gemaakt.",
};

export function plannerRedirect(
  appBaseUrl: string,
  slug: string,
  message: Readonly<{ notice?: PlannerNotice; error?: PlannerError }> = {},
): NextResponse {
  if (!isTosEventSlug(slug)) throw new Error("Invalid planner redirect.");
  const url = new URL(`/beheer/tos/${slug}`, appBaseUrl);
  if (message.notice) url.searchParams.set("notice", message.notice);
  if (message.error) url.searchParams.set("error", message.error);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export function plannerMessage(
  notice: string | undefined,
  error: string | undefined,
): Readonly<{ tone: "success" | "danger"; text: string }> | null {
  if (notice && notice in NOTICES) return { tone: "success", text: NOTICES[notice as PlannerNotice] };
  if (error && error in ERRORS) return { tone: "danger", text: ERRORS[error as PlannerError] };
  return null;
}
