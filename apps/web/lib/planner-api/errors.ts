export const PLANNER_TECHNICAL_ERRORS = {
  SEARCH_DEADLINE_REACHED: { status: 504, title: "Geen schema gevonden binnen de beschikbare zoektijd.", message: "De planner vond binnen deze zoektijd geen complete indeling. Dit bewijst niet dat de opzet ongeldig is." },
  TRANSPORT_TIMEOUT: { status: 504, title: "De planner reageerde niet op tijd.", message: "Probeer het over een moment opnieuw." },
  PLANNER_UNAVAILABLE: { status: 503, title: "Planner tijdelijk niet bereikbaar", message: "Probeer het over een moment opnieuw." },
  PLANNER_INTERNAL_ERROR: { status: 502, title: "Er ging iets mis tijdens het genereren.", message: "Probeer opnieuw." },
  MALFORMED_RESPONSE: { status: 502, title: "Er ging iets mis tijdens het genereren.", message: "De planner gaf geen bruikbaar antwoord. Probeer opnieuw." },
  INVALID_CHECKPOINT: { status: 409, title: "Dit voorstel kan niet meer worden opgeslagen.", message: "Genereer een nieuw voorstel en controleer het opnieuw." },
} as const;
export type PlannerTechnicalCode = keyof typeof PLANNER_TECHNICAL_ERRORS;
export function isPlannerTechnicalCode(value: unknown): value is PlannerTechnicalCode {
  return typeof value === "string" && Object.hasOwn(PLANNER_TECHNICAL_ERRORS, value);
}
