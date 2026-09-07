import { notFound } from "next/navigation";

import { LivePageState } from "../../../components/live/live-page-state";
import { LiveSchedule } from "../../../components/live/live-schedule";
import { navigationModelFromAccount } from "../../../components/ui";
import { loadOptionalAccountContext } from "../../../lib/auth/session";
import { loadEventPublicSchedule } from "../../../lib/supabase/public-schedule-repository";
import { isTosEventSlug } from "../../../lib/tos/slug";
import { loadOwnLivePlayerKey } from "../../../lib/public-schedule/own-identity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EventLivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isTosEventSlug(slug)) notFound();
  const account = await loadOptionalAccountContext();
  const navigation = navigationModelFromAccount(account);
  let schedule;
  try { schedule = await loadEventPublicSchedule(slug); }
  catch { return <LivePageState kind="error" navigation={navigation} />; }
  if (!schedule) return <LivePageState kind="empty" navigation={navigation} />;
  const now = new Date();
  const current = !!schedule.eventStartsAt && !!schedule.eventEndsAt && Date.parse(schedule.eventStartsAt) <= now.getTime() && now.getTime() < Date.parse(schedule.eventEndsAt);
  const ownPlayerKey = current && schedule.liveIdentity ? await loadOwnLivePlayerKey(account, slug, schedule.id) : null;
  return <LiveSchedule schedule={schedule} initialNowIso={now.toISOString()} navigation={navigation} ownPlayerKey={ownPlayerKey} />;
}
