import { LivePageState } from "../../components/live/live-page-state";
import { LiveSelection } from "../../components/live/live-selection";
import { navigationModelFromAccount } from "../../components/ui";
import { loadOptionalAccountContext } from "../../lib/auth/session";
import { loadPublicLiveCandidates } from "../../lib/supabase/public-schedule-repository";
import { resolveLiveCandidates } from "../../lib/public-schedule/live-resolver";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const navigation = navigationModelFromAccount(await loadOptionalAccountContext());
  let candidates;
  try {
    candidates = await loadPublicLiveCandidates();
  } catch {
    return <LivePageState kind="error" navigation={navigation} />;
  }

  const now = new Date();
  const resolution = resolveLiveCandidates(candidates, now);
  if (resolution.kind === "empty") {
    return <LivePageState kind="empty" navigation={navigation} />;
  }
  if (resolution.kind === "redirect") redirect(`/live/${resolution.slug}`);
  return <LiveSelection candidates={resolution.candidates} navigation={navigation} nowIso={now.toISOString()} />;
}
