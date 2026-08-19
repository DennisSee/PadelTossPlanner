import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { PublicSupabaseConfig } from "../config/public-supabase";
import { parsePublicSchedule } from "../public-schedule/parser";
import {
  PUBLIC_SCHEDULE_SELECT,
  type PublicSchedule,
} from "../public-schedule/types";

export class PublicScheduleUnavailableError extends Error {
  constructor() {
    super("Het live schema kan momenteel niet worden geladen.");
    this.name = "PublicScheduleUnavailableError";
  }
}

export class InvalidPublicScheduleError extends Error {
  constructor() {
    super("Het gepubliceerde schema heeft een onbekend formaat.");
    this.name = "InvalidPublicScheduleError";
  }
}

export type PublicScheduleClientFactory = (
  url: string,
  publishableKey: string,
) => SupabaseClient;

export const PUBLIC_CLIENT_OPTIONS = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
} as const;

function createPublicClient(url: string, publishableKey: string): SupabaseClient {
  return createClient(url, publishableKey, PUBLIC_CLIENT_OPTIONS);
}

export class PublicScheduleRepository {
  private readonly client: SupabaseClient;

  constructor(
    config: PublicSupabaseConfig,
    clientFactory: PublicScheduleClientFactory = createPublicClient,
  ) {
    this.client = clientFactory(config.url, config.publishableKey);
  }

  async latestPublishedSchedule(): Promise<PublicSchedule | null> {
    const response = await this.client
      .from("schedules")
      .select(PUBLIC_SCHEDULE_SELECT)
      .eq("is_published", true)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (response.error) {
      throw new PublicScheduleUnavailableError();
    }

    const first = Array.isArray(response.data) ? response.data[0] : null;
    if (!first) {
      return null;
    }

    const parsed = parsePublicSchedule(first);
    if (!parsed.ok) {
      throw new InvalidPublicScheduleError();
    }
    return parsed.value;
  }
}

export async function loadLatestPublicSchedule(): Promise<PublicSchedule | null> {
  const { readPublicSupabaseConfig } = await import("../config/public-supabase");
  return new PublicScheduleRepository(readPublicSupabaseConfig()).latestPublishedSchedule();
}
