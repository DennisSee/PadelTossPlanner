import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { PublicSupabaseConfig } from "../config/public-supabase";
import { parseEventPublicSchedule, parsePublicSchedule } from "../public-schedule/parser";
import { isTosEventSlug } from "../tos/slug";
import {
  PUBLIC_SCHEDULE_SELECT,
  type PublicSchedule,
  type PublicLiveCandidate,
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
const CONTROL = /[\u0000-\u001f\u007f]/u;

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

  async eventPublishedSchedule(slug: string): Promise<PublicSchedule | null> {
    const response = await this.client.rpc("public_event_live_schedule", { p_slug: slug });
    if (response.error || !Array.isArray(response.data)) throw new PublicScheduleUnavailableError();
    if (!response.data[0]) return null;
    if (response.data.length !== 1) throw new InvalidPublicScheduleError();
    const parsed = parseEventPublicSchedule(response.data[0]);
    if (!parsed.ok) throw new InvalidPublicScheduleError();
    return parsed.value;
  }

  async liveCandidates(): Promise<PublicLiveCandidate[]> {
    const response = await this.client.rpc("public_live_schedule_candidates");
    if (response.error || !Array.isArray(response.data)) throw new PublicScheduleUnavailableError();
    return response.data.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidPublicScheduleError();
      const row = value as Record<string, unknown>;
      if (typeof row.slug !== "string" || !isTosEventSlug(row.slug) || typeof row.title !== "string" || !row.title.trim() ||
          row.title.length > 160 || CONTROL.test(row.title) ||
          (row.sport !== "padel" && row.sport !== "tennis") || typeof row.starts_at !== "string" ||
          typeof row.ends_at !== "string" || Number.isNaN(Date.parse(row.starts_at)) || Number.isNaN(Date.parse(row.ends_at)) ||
          Date.parse(row.ends_at) <= Date.parse(row.starts_at)) {
        throw new InvalidPublicScheduleError();
      }
      return Object.freeze({ slug: row.slug, title: row.title.trim(), sport: row.sport,
        startsAt: row.starts_at, endsAt: row.ends_at });
    });
  }
}

export async function loadLatestPublicSchedule(): Promise<PublicSchedule | null> {
  const { readPublicSupabaseConfig } = await import("../config/public-supabase");
  return new PublicScheduleRepository(readPublicSupabaseConfig()).latestPublishedSchedule();
}

export async function loadEventPublicSchedule(slug: string): Promise<PublicSchedule | null> {
  const { readPublicSupabaseConfig } = await import("../config/public-supabase");
  return new PublicScheduleRepository(readPublicSupabaseConfig()).eventPublishedSchedule(slug);
}

export async function loadPublicLiveCandidates(): Promise<PublicLiveCandidate[]> {
  const { readPublicSupabaseConfig } = await import("../config/public-supabase");
  return new PublicScheduleRepository(readPublicSupabaseConfig()).liveCandidates();
}
