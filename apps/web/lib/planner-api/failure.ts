import type { PlannerFailureDiagnostic, PlannerGenerationFailure } from "./types";

const FAILURE_KEYS = ["error", "summary", "diagnostics", "probes_run"] as const;
const FAILURE_DIAGNOSTIC_KEYS = [
  "code", "severity", "message", "suggested_change", "setting", "current_value", "suggested_value",
] as const;
const FAILURE_CODES = new Set(["INVALID_PLANNER_INPUT", "NO_VALID_SCHEDULE"]);
const DIAGNOSTIC_CODES = new Set([
  "INSUFFICIENT_PLAYERS", "AVAILABILITY_SHORTAGE", "INVALID_AVAILABILITY",
  "SESSION_TOO_SHORT", "NO_COURTS", "INVALID_CONFIGURATION",
  "SEARCH_BUDGET_TOO_SMALL", "DIFFERENT_SEED_MAY_HELP", "SEARCH_BUDGET_EXHAUSTED",
]);
const CONTROL = /[\u0000-\u001f\u007f]/u;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid planner failure.");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function safeText(value: unknown, maximum = 320): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= maximum && !CONTROL.test(value);
}

function settingValue(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === "boolean" ||
    (typeof value === "string" && value.length <= 40 && !CONTROL.test(value)) ||
    (typeof value === "number" && Number.isFinite(value));
}

function parseFailureDiagnostic(value: unknown): PlannerFailureDiagnostic {
  const diagnostic = record(value);
  if (!exactKeys(diagnostic, FAILURE_DIAGNOSTIC_KEYS) ||
      typeof diagnostic.code !== "string" || !DIAGNOSTIC_CODES.has(diagnostic.code) ||
      (diagnostic.severity !== "blocking" && diagnostic.severity !== "likely" && diagnostic.severity !== "unknown") ||
      !safeText(diagnostic.message) || !safeText(diagnostic.suggested_change) ||
      (diagnostic.setting !== null && (!safeText(diagnostic.setting, 40) || !/^[a-z_]+$/u.test(diagnostic.setting))) ||
      !settingValue(diagnostic.current_value) || !settingValue(diagnostic.suggested_value)) {
    throw new Error("Invalid planner failure diagnostic.");
  }
  return Object.freeze({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    suggestedChange: diagnostic.suggested_change,
    setting: diagnostic.setting,
    currentValue: diagnostic.current_value,
    suggestedValue: diagnostic.suggested_value,
  });
}

export function parsePlannerGenerationFailure(value: unknown): PlannerGenerationFailure {
  const failure = record(value);
  if (!exactKeys(failure, FAILURE_KEYS) || typeof failure.error !== "string" ||
      !FAILURE_CODES.has(failure.error) || !safeText(failure.summary, 160) ||
      !Array.isArray(failure.diagnostics) || failure.diagnostics.length < 1 || failure.diagnostics.length > 3 ||
      !Number.isSafeInteger(failure.probes_run) || typeof failure.probes_run !== "number" ||
      failure.probes_run < 0 || failure.probes_run > 2) throw new Error("Invalid planner failure.");
  return Object.freeze({
    code: failure.error as PlannerGenerationFailure["code"],
    summary: failure.summary,
    diagnostics: failure.diagnostics.map(parseFailureDiagnostic),
    probesRun: failure.probes_run,
  });
}

export function serializePlannerGenerationFailure(failure: PlannerGenerationFailure): Readonly<Record<string, unknown>> {
  return Object.freeze({
    error: failure.code,
    summary: failure.summary,
    diagnostics: failure.diagnostics.map((diagnostic) => Object.freeze({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      suggested_change: diagnostic.suggestedChange,
      setting: diagnostic.setting,
      current_value: diagnostic.currentValue,
      suggested_value: diagnostic.suggestedValue,
    })),
    probes_run: failure.probesRun,
  });
}
