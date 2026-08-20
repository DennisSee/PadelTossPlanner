export const TOS_NOTICES = {
  "profile-created": "Je clubprofiel is aangemaakt.",
  "registration-created": "Je aanmelding is opgeslagen.",
  "registration-updated": "Je aanmelding is gewijzigd.",
  "registration-declined": "Je hebt je afgemeld.",
} as const;

export const TOS_ERRORS = {
  "invalid-request": "Controleer je invoer en probeer het opnieuw.",
  "not-authorized": "Je kunt deze actie met je huidige clubstatus niet uitvoeren.",
  "self-service-closed": "Inschrijven of wijzigen is voor deze TOS gesloten.",
  conflict: "Je aanmelding is intussen gewijzigd. Laad de pagina opnieuw.",
  "temporarily-unavailable": "Dit is tijdelijk niet beschikbaar. Probeer het later opnieuw.",
} as const;

export type TosNotice = keyof typeof TOS_NOTICES;
export type TosErrorCode = keyof typeof TOS_ERRORS;

export function publicTosMessage(
  notice: string | undefined,
  error: string | undefined,
): Readonly<{ tone: "success" | "danger"; text: string } | null> {
  if (notice && notice in TOS_NOTICES) {
    return Object.freeze({
      tone: "success" as const,
      text: TOS_NOTICES[notice as TosNotice],
    });
  }
  if (error && error in TOS_ERRORS) {
    return Object.freeze({
      tone: "danger" as const,
      text: TOS_ERRORS[error as TosErrorCode],
    });
  }
  return null;
}
