import { notFound } from "next/navigation";

import { LivePageState } from "../../../components/live/live-page-state";
import { LiveSchedule } from "../../../components/live/live-schedule";
import { navigationModelFromAccount } from "../../../components/ui";
import { loadOptionalAccountContext } from "../../../lib/auth/session";
import { loadEventPublicSchedule } from "../../../lib/supabase/public-schedule-repository";
import { isTosEventSlug } from "../../../lib/tos/slug";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EventLivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isTosEventSlug(slug)) notFound();
  const navigation = navigationModelFromAccount(await loadOptionalAccountContext());
  let schedule;
  try { schedule = await loadEventPublicSchedule(slug); }
  catch { return <LivePageState kind="error" navigation={navigation} />; }
  if (!schedule) return <LivePageState kind="empty" navigation={navigation} />;
  return <LiveSchedule schedule={schedule} initialNowIso={new Date().toISOString()} navigation={navigation} />;
}
