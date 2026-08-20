import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  parseAttendeeNames,
  parseOwnRegistration,
  parseOwnRegistrationWithEvent,
  parseTosEvent,
  rows,
} from "./parser";
import { isTosEventSlug } from "./slug";
import {
  OWN_REGISTRATION_SELECT,
  OWN_REGISTRATION_WITH_EVENT_SELECT,
  TOS_EVENT_SELECT,
  type OwnRegistration,
  type OwnRegistrationWithEvent,
  type RegistrationWrite,
  type TosEvent,
} from "./types";
import { sortEvents, sortRegistrations } from "./dashboard";

type QueryResult = Readonly<{
  data: unknown;
  error: unknown;
  status?: number;
}>;

export class TosDataUnavailableError extends Error {
  constructor() {
    super("De TOS-gegevens zijn tijdelijk niet beschikbaar.");
    this.name = "TosDataUnavailableError";
  }
}

export class TosConflictError extends TosDataUnavailableError {
  constructor() {
    super();
    this.name = "TosConflictError";
  }
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function resultRows(result: QueryResult): Record<string, unknown>[] {
  if (result.error) {
    if (result.status === 409 || errorCode(result.error) === "23505") {
      throw new TosConflictError();
    }
    throw new TosDataUnavailableError();
  }
  try {
    return rows(result.data);
  } catch {
    throw new TosDataUnavailableError();
  }
}

function optionalSingle(result: QueryResult): Record<string, unknown> | null {
  const values = resultRows(result);
  if (values.length > 1) throw new TosDataUnavailableError();
  return values[0] ?? null;
}

function requiredSingle(result: QueryResult): Record<string, unknown> {
  const value = optionalSingle(result);
  if (!value) throw new TosDataUnavailableError();
  return value;
}

export class TosRepository {
  constructor(private readonly client: SupabaseClient) {}

  async eventBySlug(
    slug: string,
    options: Readonly<{ openOnly: boolean }>,
  ): Promise<TosEvent | null> {
    if (!isTosEventSlug(slug)) throw new TosDataUnavailableError();
    let query = this.client
      .from("tos_events")
      .select(TOS_EVENT_SELECT)
      .eq("slug", slug);
    if (options.openOnly) query = query.eq("status", "open");
    const row = optionalSingle(await query.limit(2));
    if (!row) return null;
    try {
      return parseTosEvent(row);
    } catch {
      throw new TosDataUnavailableError();
    }
  }

  async listOpenEvents(now: Date): Promise<TosEvent[]> {
    const timestamp = now.toISOString();
    const result = await this.client
      .from("tos_events")
      .select(TOS_EVENT_SELECT)
      .eq("status", "open")
      .gte("ends_at", timestamp)
      .or(`signup_deadline.is.null,signup_deadline.gte.${timestamp}`)
      .order("starts_at", { ascending: true });
    try {
      return sortEvents(resultRows(result).map(parseTosEvent));
    } catch (error) {
      if (error instanceof TosDataUnavailableError) throw error;
      throw new TosDataUnavailableError();
    }
  }

  async listOwnUpcomingRegistrations(
    userId: string,
    now: Date,
  ): Promise<OwnRegistrationWithEvent[]> {
    const result = await this.client
      .from("registrations")
      .select(OWN_REGISTRATION_WITH_EVENT_SELECT)
      .eq("user_id", userId)
      .gte("tos_events.ends_at", now.toISOString());
    try {
      return sortRegistrations(resultRows(result).map(parseOwnRegistrationWithEvent));
    } catch (error) {
      if (error instanceof TosDataUnavailableError) throw error;
      throw new TosDataUnavailableError();
    }
  }

  async ownRegistration(
    eventId: string,
    userId: string,
  ): Promise<OwnRegistration | null> {
    const row = optionalSingle(
      await this.client
        .from("registrations")
        .select(OWN_REGISTRATION_SELECT)
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .limit(2),
    );
    if (!row) return null;
    try {
      return parseOwnRegistration(row);
    } catch {
      throw new TosDataUnavailableError();
    }
  }

  async attendeeNames(eventId: string): Promise<string[]> {
    const result = await this.client.rpc("participant_event_attendee_names", {
      p_event_id: eventId,
    });
    if (result.error) throw new TosDataUnavailableError();
    try {
      return parseAttendeeNames(result.data);
    } catch {
      throw new TosDataUnavailableError();
    }
  }

  async selfOnboard(displayName: string): Promise<void> {
    const result = await this.client.rpc("self_onboard_member", {
      p_display_name: displayName,
    });
    if (result.error || result.data === null) {
      throw new TosDataUnavailableError();
    }
  }

  async createRegistration(
    eventId: string,
    write: RegistrationWrite,
  ): Promise<OwnRegistration> {
    const payload = {
      event_id: eventId,
      response: write.response,
      available_from: write.availableFrom,
      available_until: write.availableUntil,
    };
    const row = requiredSingle(
      await this.client
        .from("registrations")
        .insert(payload)
        .select(OWN_REGISTRATION_SELECT)
        .limit(2),
    );
    try {
      return parseOwnRegistration(row);
    } catch {
      throw new TosDataUnavailableError();
    }
  }

  async updateRegistration(
    registration: OwnRegistration,
    userId: string,
    write: RegistrationWrite,
  ): Promise<OwnRegistration> {
    const payload = {
      response: write.response,
      available_from: write.availableFrom,
      available_until: write.availableUntil,
    };
    const row = requiredSingle(
      await this.client
        .from("registrations")
        .update(payload)
        .eq("id", registration.id)
        .eq("user_id", userId)
        .eq("event_id", registration.eventId)
        .select(OWN_REGISTRATION_SELECT)
        .limit(2),
    );
    try {
      return parseOwnRegistration(row);
    } catch {
      throw new TosDataUnavailableError();
    }
  }
}
