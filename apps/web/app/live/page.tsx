import { LivePageState } from "../../components/live/live-page-state";
import { LiveSchedule } from "../../components/live/live-schedule";
import { navigationModelFromAccount } from "../../components/ui";
import { loadOptionalAccountContext } from "../../lib/auth/session";
import { loadLatestPublicSchedule } from "../../lib/supabase/public-schedule-repository";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const navigation = navigationModelFromAccount(await loadOptionalAccountContext());
  let schedule;
  try {
    schedule = await loadLatestPublicSchedule();
  } catch {
    return <LivePageState kind="error" navigation={navigation} />;
  }

  if (!schedule) {
    return <LivePageState kind="empty" navigation={navigation} />;
  }
  return (
    <LiveSchedule
      schedule={schedule}
      initialNowIso={new Date().toISOString()}
      navigation={navigation}
    />
  );
}
