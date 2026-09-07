import "server-only";
import type { AccountContext } from "../auth/account-context";
import { createServerSupabaseClient } from "../supabase/server";
import { isTosEventSlug } from "../tos/slug";
import { OPAQUE_KEY } from "./identity";

export async function loadOwnLivePlayerKey(
  account: AccountContext | null, slug: string, scheduleId: string,
  clientFactory = createServerSupabaseClient,
): Promise<string | null> {
  if (!account?.capabilities.canParticipate || !isTosEventSlug(slug)) return null;
  try {
    const client = await clientFactory();
    const { data, error } = await client.rpc("my_published_event_schedule_identity", { p_slug: slug });
    if (error || !Array.isArray(data) || data.length !== 1) return null;
    const row = data[0];
    if (!row || Object.keys(row).sort().join() !== "player_key,schedule_id" || row.schedule_id !== scheduleId || typeof row.player_key !== "string" || !OPAQUE_KEY.test(row.player_key)) return null;
    return row.player_key;
  } catch { return null; }
}
