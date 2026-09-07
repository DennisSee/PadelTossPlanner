import "server-only";

import type { PlannerGenerateRequest, PlannerGeneration, PlannerGenerationFailure, PrivateScheduleRow } from "./types";
import { parsePlannerGenerationFailure } from "./failure";
import { isPlannerTechnicalCode, type PlannerTechnicalCode } from "./errors";

// Maximum engine deadline 13s + 9s response/transport margin. Always bounded.
export const PLANNER_HTTP_TIMEOUT_MS = 22_000;

const ROW_KEYS = [
  "Ronde", "Tijd", "Baan", "Team 1", "Niveau T1", "Team 2", "Niveau T2",
  "Teamverschil", "Rust", "Nog niet aanwezig", "Niet meer beschikbaar",
] as const;
const RESPONSE_KEYS = ["seed", "schedule", "statistics", "diagnostics"] as const;

export class PlannerApiError extends Error {
  constructor(readonly code: PlannerTechnicalCode = "MALFORMED_RESPONSE") {
    super("De plannergenerator is tijdelijk niet beschikbaar.");
    this.name = "PlannerApiError";
  }
}

export class PlannerGenerationError extends PlannerApiError {
  constructor(readonly failure: PlannerGenerationFailure) {
    super();
    this.name = "PlannerGenerationError";
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
  const keys = response.checkpoint === undefined ? RESPONSE_KEYS : [...RESPONSE_KEYS, "checkpoint"];
  if (!exactKeys(response, keys) ||
      (response.checkpoint !== undefined && (typeof response.checkpoint !== "string" || response.checkpoint.length > 2048 || !/^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/u.test(response.checkpoint))) ||
      !Number.isSafeInteger(response.seed) || typeof response.seed !== "number" ||
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
    ...(typeof response.checkpoint === "string" ? { checkpoint: response.checkpoint } : {}),
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
  const timeout = setTimeout(() => controller.abort(), options.timeoutMilliseconds ?? PLANNER_HTTP_TIMEOUT_MS);
  try {
    const response = await (options.fetcher ?? fetch)(`${options.baseUrl ?? readPlannerApiBaseUrl()}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
    let body: unknown;
    try { body = await response.json(); } catch {
      if (controller.signal.aborted) throw new PlannerApiError("TRANSPORT_TIMEOUT");
      throw new PlannerApiError(response.ok ? "MALFORMED_RESPONSE" : "PLANNER_UNAVAILABLE");
    }
    if (!response.ok && body && typeof body === "object" && "error" in body && isPlannerTechnicalCode(body.error)) {
      throw new PlannerApiError(body.error);
    }
    if (response.status === 422) {
      try { throw new PlannerGenerationError(parsePlannerGenerationFailure(body)); }
      catch (error) { if (error instanceof PlannerGenerationError) throw error; throw new PlannerApiError("MALFORMED_RESPONSE"); }
    }
    if (!response.ok) throw new PlannerApiError("PLANNER_UNAVAILABLE");
    return parsePlannerGeneration(body);
  } catch (error) {
    if (error instanceof PlannerGenerationError || error instanceof PlannerApiError) throw error;
    throw new PlannerApiError(controller.signal.aborted ? "TRANSPORT_TIMEOUT" : "PLANNER_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}
