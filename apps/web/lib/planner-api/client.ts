import "server-only";

import type { PlannerGenerateRequest, PlannerGeneration, PrivateScheduleRow } from "./types";

const ROW_KEYS = [
  "Ronde", "Tijd", "Baan", "Team 1", "Niveau T1", "Team 2", "Niveau T2",
  "Teamverschil", "Rust", "Nog niet aanwezig", "Niet meer beschikbaar",
] as const;
const RESPONSE_KEYS = ["seed", "schedule", "statistics", "diagnostics"] as const;

export class PlannerApiError extends Error {
  constructor() {
    super("De plannergenerator is tijdelijk niet beschikbaar.");
    this.name = "PlannerApiError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlannerApiError();
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function parseRow(value: unknown): PrivateScheduleRow {
  const row = record(value);
  if (!exactKeys(row, ROW_KEYS) || !Number.isInteger(row.Ronde) || typeof row.Ronde !== "number" ||
      typeof row.Tijd !== "string" || typeof row.Baan !== "string" || typeof row["Team 1"] !== "string" ||
      typeof row["Team 2"] !== "string" || typeof row.Rust !== "string" ||
      typeof row["Nog niet aanwezig"] !== "string" || typeof row["Niet meer beschikbaar"] !== "string" ||
      typeof row["Niveau T1"] !== "number" || typeof row["Niveau T2"] !== "number" ||
      typeof row.Teamverschil !== "number") throw new PlannerApiError();
  return row as PrivateScheduleRow;
}

export function parsePlannerGeneration(value: unknown): PlannerGeneration {
  const response = record(value);
  if (!exactKeys(response, RESPONSE_KEYS) || !Number.isSafeInteger(response.seed) || typeof response.seed !== "number" ||
      !Array.isArray(response.schedule) || !Array.isArray(response.statistics) ||
      !response.diagnostics || typeof response.diagnostics !== "object" || Array.isArray(response.diagnostics)) {
    throw new PlannerApiError();
  }
  const statistics = response.statistics.map((entry) => {
    const value = record(entry);
    if (Object.values(value).some((item) => typeof item !== "string" && typeof item !== "number")) throw new PlannerApiError();
    return value as Record<string, string | number>;
  });
  return Object.freeze({
    seed: response.seed,
    schedule: response.schedule.map(parseRow),
    statistics,
    diagnostics: response.diagnostics as Record<string, unknown>,
  });
}

export function readPlannerApiBaseUrl(environment = process.env): string {
  const raw = environment.PLANNER_API_BASE_URL;
  if (!raw) throw new PlannerApiError();
  let url: URL;
  try { url = new URL(raw); } catch { throw new PlannerApiError(); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.protocol !== "http:") {
    throw new PlannerApiError();
  }
  const allowed = new Set(["planner-api", "127.0.0.1", "localhost"]);
  const loopback = new Set(["127.0.0.1", "localhost"]);
  let isolatedLoopback = false;
  try {
    const app = new URL(String(environment.APP_BASE_URL));
    const supabase = new URL(String(environment.SUPABASE_URL));
    isolatedLoopback = loopback.has(url.hostname) && loopback.has(app.hostname) && loopback.has(supabase.hostname) &&
      app.protocol === "http:" && supabase.protocol === "http:" && !app.username && !app.password &&
      !supabase.username && !supabase.password;
  } catch {
    isolatedLoopback = false;
  }
  if (!allowed.has(url.hostname) || (environment.APP_ENV === "staging" && url.hostname !== "planner-api" && !isolatedLoopback)) {
    throw new PlannerApiError();
  }
  return url.origin;
}

export async function generatePlannerSchedule(
  payload: PlannerGenerateRequest,
  options: Readonly<{ baseUrl?: string; fetcher?: typeof fetch; timeoutMilliseconds?: number }> = {},
): Promise<PlannerGeneration> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMilliseconds ?? 15_000);
  try {
    const response = await (options.fetcher ?? fetch)(`${options.baseUrl ?? readPlannerApiBaseUrl()}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new PlannerApiError();
    return parsePlannerGeneration(await response.json());
  } catch (error) {
    if (error instanceof PlannerApiError) throw error;
    throw new PlannerApiError();
  } finally {
    clearTimeout(timeout);
  }
}
