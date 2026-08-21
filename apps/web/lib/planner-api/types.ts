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
  seed: number;
  schedule: readonly PrivateScheduleRow[];
  statistics: readonly Readonly<Record<string, string | number>>[];
  diagnostics: Readonly<Record<string, unknown>>;
}>;
