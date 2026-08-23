import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "./parser";
import type { ClubCourt, TosSport } from "./types";

type RpcResult = Readonly<{ data?: unknown; error?: unknown }>;
const CONTROL = /[\u0000-\u001f\u007f]/u;

export class CourtDataError extends Error {
  constructor() {
    super("Banenbeheer is tijdelijk niet beschikbaar.");
    this.name = "CourtDataError";
  }
}
function parseCourt(value: unknown): ClubCourt {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CourtDataError();
  const row = value as Record<string, unknown>;
  const keys = ["active", "id", "name", "sort_order", "sport"];
  if (Object.keys(row).sort().join(",") !== keys.join(",") || typeof row.id !== "string" || !isUuid(row.id) ||
      (row.sport !== "padel" && row.sport !== "tennis") || typeof row.name !== "string" ||
      !row.name.trim() || row.name !== row.name.trim() || row.name.length > 80 || CONTROL.test(row.name) ||
      typeof row.active !== "boolean" || typeof row.sort_order !== "number" || !Number.isInteger(row.sort_order) ||
      row.sort_order < 0 || row.sort_order > 10000) throw new CourtDataError();
  return Object.freeze({ id: row.id, sport: row.sport, name: row.name, active: row.active, sortOrder: row.sort_order });
}

export class CourtRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(sport?: TosSport): Promise<ClubCourt[]> {
    const result = await this.client.rpc("staff_courts", { p_sport: sport ?? null }) as RpcResult;
    if (result.error || !Array.isArray(result.data)) throw new CourtDataError();
    return result.data.map(parseCourt);
  }

  async create(input: Readonly<{ sport: TosSport; name: string; active: boolean; sortOrder: number }>): Promise<string> {
    const result = await this.client.rpc("staff_create_court", {
      p_sport: input.sport, p_name: input.name, p_active: input.active, p_sort_order: input.sortOrder,
    }) as RpcResult;
    if (result.error || typeof result.data !== "string" || !isUuid(result.data)) throw new CourtDataError();
    return result.data;
  }

  async update(input: Readonly<{ courtId: string; name: string; active: boolean; sortOrder: number }>): Promise<void> {
    if (!isUuid(input.courtId)) throw new CourtDataError();
    const result = await this.client.rpc("staff_update_court", {
      p_court_id: input.courtId, p_name: input.name, p_active: input.active, p_sort_order: input.sortOrder,
    }) as RpcResult;
    if (result.error || result.data !== true) throw new CourtDataError();
  }
}
