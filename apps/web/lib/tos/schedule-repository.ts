import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PlannerGeneration } from "../planner-api/types";
import { parsePlannerGeneration } from "../planner-api/client";
import { isUuid, parseOffsetTimestamp } from "./parser";
import type { PlannerDraft, StaffScheduleDetail, StaffScheduleSummary, TosEvent } from "./types";

type RpcResult = Readonly<{ data?: unknown; error?: unknown }>;

export class StaffScheduleDataError extends Error {
  constructor() {
    super("Opgeslagen schema's zijn tijdelijk niet beschikbaar.");
    this.name = "StaffScheduleDataError";
  }
}

export class StaffScheduleConflictError extends StaffScheduleDataError {
  constructor() {
    super();
    this.name = "StaffScheduleConflictError";
  }
}

export class StaffSchedulePublicationError extends StaffScheduleDataError {
  constructor() {
    super();
    this.name = "StaffSchedulePublicationError";
  }
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? String((error as { code: string }).code)
    : "";
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StaffScheduleDataError();
  return value as Record<string, unknown>;
}

function summary(value: unknown): StaffScheduleSummary {
  const row = record(value);
  const keys = ["id","event_id","created_by","created_by_name","is_published","generation_seed","planner_draft_revision","created_at"];
  if (Object.keys(row).length !== keys.length || Object.keys(row).some((key) => !keys.includes(key)) ||
      typeof row.id !== "string" || !isUuid(row.id) || typeof row.event_id !== "string" || !isUuid(row.event_id) ||
      typeof row.created_by !== "string" || !isUuid(row.created_by) || typeof row.created_by_name !== "string" ||
      !row.created_by_name.trim() || typeof row.is_published !== "boolean" ||
      !Number.isSafeInteger(row.generation_seed) || typeof row.generation_seed !== "number" ||
      !Number.isSafeInteger(row.planner_draft_revision) || typeof row.planner_draft_revision !== "number") {
    throw new StaffScheduleDataError();
  }
  return Object.freeze({
    id: row.id, eventId: row.event_id, createdBy: row.created_by,
    createdByName: row.created_by_name.trim(), isPublished: row.is_published,
    generationSeed: row.generation_seed, plannerDraftRevision: row.planner_draft_revision,
    createdAt: parseOffsetTimestamp(row.created_at),
  });
}

function detail(value: unknown): StaffScheduleDetail {
  const row = record(value);
  const keys = [
    "id","event_id","created_by","created_by_name","title","event_date","start_time","end_time",
    "match_minutes","courts","players_private","schedule_private","statistics_private","diagnostics",
    "is_published","generation_seed","planner_draft_revision","created_at",
  ];
  if (Object.keys(row).length !== keys.length || Object.keys(row).some((key) => !keys.includes(key)) ||
      typeof row.title !== "string" || !row.title.trim() || typeof row.event_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(row.event_date) || typeof row.start_time !== "string" ||
      typeof row.end_time !== "string" || !Number.isInteger(row.match_minutes) ||
      !Array.isArray(row.courts) || row.courts.some((court) => typeof court !== "string") ||
      !Array.isArray(row.players_private)) throw new StaffScheduleDataError();
  const base = summary(Object.fromEntries([
    "id","event_id","created_by","created_by_name","is_published","generation_seed","planner_draft_revision","created_at",
  ].map((key) => [key, row[key]])));
  const generated = parsePlannerGeneration({
    seed: row.generation_seed, schedule: row.schedule_private,
    statistics: row.statistics_private, diagnostics: row.diagnostics,
  });
  return Object.freeze({
    ...base, title: row.title.trim(), eventDate: row.event_date,
    startTime: row.start_time, endTime: row.end_time, matchMinutes: row.match_minutes as number,
    courts: row.courts as string[], schedule: generated.schedule,
    statistics: generated.statistics, diagnostics: generated.diagnostics,
  });
}

export class StaffScheduleRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(eventId: string): Promise<StaffScheduleSummary[]> {
    if (!isUuid(eventId)) throw new StaffScheduleDataError();
    const result = await this.client.rpc("staff_event_schedule_summaries", { p_event_id: eventId }) as RpcResult;
    if (result.error || !Array.isArray(result.data)) throw new StaffScheduleDataError();
    return result.data.map(summary);
  }

  async save(event: TosEvent, draft: PlannerDraft, generation: PlannerGeneration): Promise<string> {
    const result = await this.client.rpc("staff_save_event_schedule", {
      p_event_id: event.id,
      p_planner_draft_revision: draft.revision,
      p_generation_seed: generation.seed,
      p_schedule_private: generation.schedule,
      p_statistics_private: generation.statistics,
      p_diagnostics: generation.diagnostics,
    }) as RpcResult;
    if (result.error) {
      if (errorCode(result.error) === "40001") throw new StaffScheduleConflictError();
      throw new StaffScheduleDataError();
    }
    if (typeof result.data !== "string" || !isUuid(result.data)) throw new StaffScheduleDataError();
    return result.data;
  }

  async detail(eventId: string, scheduleId: string): Promise<StaffScheduleDetail | null> {
    if (!isUuid(eventId) || !isUuid(scheduleId)) throw new StaffScheduleDataError();
    const result = await this.client.rpc("staff_event_schedule", { p_event_id: eventId, p_schedule_id: scheduleId }) as RpcResult;
    if (result.error || !Array.isArray(result.data) || result.data.length > 1) throw new StaffScheduleDataError();
    return result.data[0] ? detail(result.data[0]) : null;
  }

  async setPublished(scheduleId: string, published: boolean): Promise<void> {
    if (!isUuid(scheduleId)) throw new StaffScheduleDataError();
    const result = await this.client.rpc("staff_set_schedule_published", { p_schedule_id: scheduleId, p_published: published }) as RpcResult;
    if (result.error) {
      if (errorCode(result.error) === "42501") throw new StaffSchedulePublicationError();
      throw new StaffScheduleDataError();
    }
    if (result.data !== true) throw new StaffScheduleDataError();
  }
}
