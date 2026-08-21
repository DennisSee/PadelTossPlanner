import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseTosEvent, rows } from "./parser";
import { parseStaffEventCapacityRows } from "./staff-data-parser";
import { isTosEventSlug } from "./slug";
import type { StaffEventCreateWrite, StaffEventUpdateWrite } from "./staff-management";
import { TOS_EVENT_SELECT, type StaffEventCapacity, type TosEvent } from "./types";

type QueryResult = Readonly<{ data?: unknown; error?: unknown; status?: number }>;

export class StaffEventDataError extends Error {
  constructor() {
    super("TOS-avonden zijn tijdelijk niet beschikbaar.");
    this.name = "StaffEventDataError";
  }
}

export class StaffEventConflictError extends StaffEventDataError {
  constructor() {
    super();
    this.name = "StaffEventConflictError";
  }
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? String((error as { code: string }).code)
    : "";
}

function assertWrite(result: QueryResult): void {
  if (!result.error) return;
  if (result.status === 409 || errorCode(result.error) === "23505") {
    throw new StaffEventConflictError();
  }
  throw new StaffEventDataError();
}

function parseRows(result: QueryResult): TosEvent[] {
  if (result.error) throw new StaffEventDataError();
  try {
    return rows(result.data).map(parseTosEvent);
  } catch {
    throw new StaffEventDataError();
  }
}

export class StaffTosEventRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listEvents(): Promise<TosEvent[]> {
    const result = await this.client
      .from("tos_events")
      .select(TOS_EVENT_SELECT)
      .order("starts_at", { ascending: false });
    return parseRows(result);
  }

  async capacitySummaries(): Promise<StaffEventCapacity[]> {
    const result = await this.client.rpc("staff_event_capacity_summaries");
    if (result.error) throw new StaffEventDataError();
    try {
      return parseStaffEventCapacityRows(result.data);
    } catch {
      throw new StaffEventDataError();
    }
  }

  async eventBySlug(slug: string): Promise<TosEvent | null> {
    if (!isTosEventSlug(slug)) throw new StaffEventDataError();
    const values = parseRows(
      await this.client
        .from("tos_events")
        .select(TOS_EVENT_SELECT)
        .eq("slug", slug)
        .limit(2),
    );
    if (values.length > 1) throw new StaffEventDataError();
    return values[0] ?? null;
  }

  async createEvent(write: StaffEventCreateWrite): Promise<void> {
    assertWrite(await this.client.from("tos_events").insert({
      slug: write.slug,
      title: write.title,
      sport: write.sport,
      starts_at: write.startsAt,
      ends_at: write.endsAt,
      signup_deadline: write.signupDeadline,
      status: write.status,
      max_participants: write.maxParticipants,
    }));
  }

  async updateEvent(event: TosEvent, write: StaffEventUpdateWrite): Promise<void> {
    assertWrite(await this.client
      .from("tos_events")
      .update({
        title: write.title,
        signup_deadline: write.signupDeadline,
        status: write.status,
        max_participants: write.maxParticipants,
      })
      .eq("id", event.id)
      .eq("slug", event.slug));
  }
}
