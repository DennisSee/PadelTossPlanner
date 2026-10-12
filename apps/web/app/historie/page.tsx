import { AccountShell } from "../../components/account/account-shell";
import { HistoryPage } from "../../components/history/history-page";
import styles from "../../components/account/account-shell.module.css";
import { StateMessage } from "../../components/ui";
import { requireAccount } from "../../lib/auth/route-guard";
import { availableHistoryYears, historyFilters, historySummary, visibleHistory } from "../../lib/history/filters";
import { historyMessage } from "../../lib/history/messages";
import { HistoryRepository } from "../../lib/history/repository";
import { createServerSupabaseClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<{ tab?: string | string[]; year?: string | string[]; sport?: string | string[]; q?: string | string[]; notice?: string | string[]; error?: string | string[] }>;
const last = (value: string | string[] | undefined) => Array.isArray(value) ? value.at(-1) : value;

async function loadHistoryPage(repository: HistoryRepository, params: Awaited<SearchParams>) {
  const [allEvents, allClubmates, requests] = await Promise.all([repository.history(), repository.clubmates(), repository.contactRequests()]);
  const filters = historyFilters(params, allEvents);
  const requestByMember = new Map(requests.map((request) => [request.otherMemberId, request]));
  const clubmates = await Promise.all(allClubmates.map(async (clubmate) => {
    const contact = requestByMember.get(clubmate.memberId) ?? null;
    const [shared, email] = await Promise.all([
      repository.sharedHistory(clubmate.memberId),
      contact?.status === "accepted" ? repository.acceptedContactEmail(clubmate.memberId) : Promise.resolve(null),
    ]);
    return Object.freeze({ clubmate, shared, contact, email });
  }));
  return Object.freeze({
    events: visibleHistory(allEvents, allClubmates, filters),
    years: availableHistoryYears(allEvents),
    filters,
    summary: historySummary(allEvents, allClubmates, filters),
    clubmates,
  });
}

export default async function HistoryRoute({ searchParams }: { searchParams: SearchParams }) {
  const client = await createServerSupabaseClient();
  const account = await requireAccount("/historie", client);
  const params = await searchParams;
  const message = historyMessage(last(params.notice), last(params.error));
  if (!account.capabilities.canParticipate) {
    return <AccountShell account={account} title="Mijn TOS-historie" intro="Je officiële gespeelde TOS-momenten." variant="tos" currentPath="/historie"><StateMessage title="Historie nog niet beschikbaar"><p>Je hebt een actief en goedgekeurd clublidmaatschap nodig.</p></StateMessage></AccountShell>;
  }
  let loaded: Awaited<ReturnType<typeof loadHistoryPage>> | null;
  try { loaded = await loadHistoryPage(new HistoryRepository(client), params); } catch { loaded = null; }
  if (!loaded) {
    return <AccountShell account={account} title="Mijn TOS-historie" intro="Je officiële gespeelde TOS-momenten." variant="tos" currentPath="/historie"><StateMessage title="Historie tijdelijk niet beschikbaar"><p>Probeer het later opnieuw.</p></StateMessage></AccountShell>;
  }
  return (
    <AccountShell account={account} title="Mijn TOS-historie" intro="Herbeleef je officiële TOS-momenten en speelcontacten." variant="tos" currentPath="/historie">
      {message ? <p className={`${styles.message} ${message.tone === "success" ? styles.messageSuccess : styles.messageDanger}`} role={message.tone === "danger" ? "alert" : "status"}>{message.text}</p> : null}
      <HistoryPage {...loaded} initialTab={last(params.tab) === "clubmates" ? "clubmates" : "events"} />
    </AccountShell>
  );
}
