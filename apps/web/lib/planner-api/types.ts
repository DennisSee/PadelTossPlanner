export type PlannerGeneratePlayer = Readonly<{
  name: string;
  ranking: number;
  available_from: string;
  available_until: string;
}>;

export type PlannerGenerateRequest = Readonly<{
  players: readonly PlannerGeneratePlayer[];
  courts: readonly string[];
  start_time: string;
  end_time: string;
  match_minutes: number;
  rest_minutes: number;
  search_profile: string;
  allow_repeat_partners: boolean;
  level_mix: number;
  tolerance: number;
  generation_seed: number;
  checkpoint_context?: string;
  checkpoint?: string;
}>;

export type PrivateScheduleRow = Readonly<{
  Ronde: number;
  Tijd: string;
  Baan: string;
  "Team 1": string;
  "Niveau T1": number;
  "Team 2": string;
  "Niveau T2": number;
  Teamverschil: number;
  Rust: string;
  "Nog niet aanwezig": string;
  "Niet meer beschikbaar": string;
}>;

export type PlannerGeneration = Readonly<{
  checkpoint?: string;
  seed: number;
  schedule: readonly PrivateScheduleRow[];
  statistics: readonly Readonly<Record<string, string | number>>[];
  diagnostics: Readonly<Record<string, unknown>>;
}>;

export type PlannerQualityCompromise =
  | "PARTNER_REPEATS"
  | "OPPONENT_REPEATS"
  | "REST_IMBALANCE"
  | "TEAM_DIFFERENCE_ABOVE_TOLERANCE";

export type PlannerQualitySummary = Readonly<{
  partnerRepeats: number;
  opponentRepeats: number;
  maxRestDifference: number;
  maxTeamDifference: number;
  compromises: readonly PlannerQualityCompromise[];
}>;

export type PlannerFailureDiagnostic = Readonly<{
  code: string;
  severity: "blocking" | "likely" | "unknown";
  message: string;
  suggestedChange: string;
  setting: string | null;
  currentValue: string | number | boolean | null;
  suggestedValue: string | number | boolean | null;
}>;

export type PlannerGenerationFailure = Readonly<{
  code: "INVALID_PLANNER_INPUT" | "NO_VALID_SCHEDULE";
  summary: string;
  diagnostics: readonly PlannerFailureDiagnostic[];
  probesRun: number;
}>;
