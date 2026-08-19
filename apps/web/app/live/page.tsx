import { LivePageState } from "../../components/live/live-page-state";
import { LiveSchedule } from "../../components/live/live-schedule";
import { loadLatestPublicSchedule } from "../../lib/supabase/public-schedule-repository";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  let schedule;
  try {
    schedule = await loadLatestPublicSchedule();
  } catch {
    return <LivePageState kind="error" />;
  }

  if (!schedule) {
    return <LivePageState kind="empty" />;
  }
  return <LiveSchedule schedule={schedule} initialNowIso={new Date().toISOString()} />;
}
