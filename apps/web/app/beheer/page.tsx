import { AccountShell } from "../../components/account/account-shell";
import {
  CreateTosEventForm,
  TosEventList,
} from "../../components/management/tos-event-management";
import { ManagementEventFilters } from "../../components/management/management-event-filters";
import { StateMessage } from "../../components/ui";
import { requirePlannerAccount } from "../../lib/auth/route-guard";
import { createServerSupabaseClient } from "../../lib/supabase/server";
import { managementMessage } from "../../lib/tos/management-request";
import { StaffTosEventRepository } from "../../lib/tos/staff-repository";
import { filterStaffEvents, staffFilters } from "../../lib/tos/event-filters";

import styles from "../../components/management/tos-event-management.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { searchParams: Promise<{
  notice?: string | string[];
  error?: string | string[];
  status?: string | string[];
  sport?: string | string[];
}> };

function last(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.at(-1) : value;
}

export default async function ManagementPage({ searchParams }: PageProps) {
  const client = await createServerSupabaseClient();
  const account = await requirePlannerAccount(client);
  let events;
  let capacities;
  try {
    const repository = new StaffTosEventRepository(client);
    [events, capacities] = await Promise.all([
      repository.listEvents(),
      repository.capacitySummaries(),
    ]);
  } catch {
    return (
      <AccountShell account={account} title="Beheeromgeving" intro="Beheer TOS-avonden en open per event het read-only deelnemersoverzicht." variant="management">
        <StateMessage title="TOS-avonden tijdelijk niet beschikbaar"><p>Probeer het later opnieuw.</p></StateMessage>
      </AccountShell>
    );
  }
  const query = await searchParams;
  const message = managementMessage(last(query.notice), last(query.error));
  const filters = staffFilters(query);
  const filteredEvents = filterStaffEvents(events, filters, new Date());
  const capacityByEvent = new Map(capacities.map((capacity) => [capacity.eventId, capacity]));
  return (
    <AccountShell
      account={account}
      title="Beheeromgeving"
      intro="Beheer TOS-avonden en open per event het read-only deelnemersoverzicht."
      variant="management"
    >
      {message ? (
        <p className={`${styles.message} ${message.tone === "success" ? styles.messageSuccess : styles.messageDanger}`} role={message.tone === "danger" ? "alert" : "status"}>
          {message.text}
        </p>
      ) : null}
      <div className={styles.layout}>
        <CreateTosEventForm />
        <div className={styles.eventArea}>
          <div className={styles.managementLinks}>
            <a href="/beheer/leden">Leden en sportprofielen beheren →</a>
          </div>
          <ManagementEventFilters
            status={filters.status}
            sport={filters.sport}
            resultCount={filteredEvents.length}
          />
          <TosEventList events={filteredEvents} capacityByEvent={capacityByEvent} />
        </div>
      </div>
    </AccountShell>
  );
}
