import type { PlannerQualityCompromise, PlannerQualitySummary } from "./types";

const QUALITY_KEYS = [
  "partner_repeats", "opponent_repeats", "max_rest_difference", "max_team_difference", "compromises",
] as const;
const COMPROMISES = new Set<PlannerQualityCompromise>([
  "PARTNER_REPEATS", "OPPONENT_REPEATS", "REST_IMBALANCE", "TEAM_DIFFERENCE_ABOVE_TOLERANCE",
]);

export function parsePlannerQualitySummary(diagnostics: Readonly<Record<string, unknown>>): PlannerQualitySummary | null {
  const value = diagnostics.quality_summary;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== QUALITY_KEYS.length || keys.some((key, index) => key !== [...QUALITY_KEYS].sort()[index])) return null;
  if (!Number.isSafeInteger(record.partner_repeats) || typeof record.partner_repeats !== "number" || record.partner_repeats < 0 ||
      !Number.isSafeInteger(record.opponent_repeats) || typeof record.opponent_repeats !== "number" || record.opponent_repeats < 0 ||
      !Number.isSafeInteger(record.max_rest_difference) || typeof record.max_rest_difference !== "number" || record.max_rest_difference < 0 ||
      typeof record.max_team_difference !== "number" || !Number.isFinite(record.max_team_difference) || record.max_team_difference < 0 ||
      !Array.isArray(record.compromises) || record.compromises.some((item) => typeof item !== "string" || !COMPROMISES.has(item as PlannerQualityCompromise)) ||
      new Set(record.compromises).size !== record.compromises.length) return null;
  return Object.freeze({
    partnerRepeats: record.partner_repeats,
    opponentRepeats: record.opponent_repeats,
    maxRestDifference: record.max_rest_difference,
    maxTeamDifference: record.max_team_difference,
    compromises: Object.freeze(record.compromises as PlannerQualityCompromise[]),
  });
}
