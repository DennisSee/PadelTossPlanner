import { AccountShell } from "../../components/account/account-shell";
import {
  CreateTosEventForm,
  TosEventList,
} from "../../components/management/tos-event-management";
import { StateMessage } from "../../components/ui";
import { requirePlannerAccount } from "../../lib/auth/route-guard";
import { createServerSupabaseClient } from "../../lib/supabase/server";
import { managementMessage } from "../../lib/tos/management-request";
import { StaffTosEventRepository } from "../../lib/tos/staff-repository";

import styles from "../../components/management/tos-event-management.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams: Promise<{ notice?: string | string[]; error?: string | string[] }>;
};

function last(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.at(-1) : value;
}

export default async function ManagementPage({ searchParams }: PageProps) {
  const client = await createServerSupabaseClient();
  const account = await requirePlannerAccount(client);
  let events;
  try {
    events = await new StaffTosEventRepository(client).listEvents();
  } catch {
    return (
      <AccountShell account={account} title="Beheeromgeving" intro="Beheer TOS-avonden en open per event het read-only deelnemersoverzicht.">
        <StateMessage title="TOS-avonden tijdelijk niet beschikbaar"><p>Probeer het later opnieuw.</p></StateMessage>
      </AccountShell>
    );
  }
  const query = await searchParams;
  const message = managementMessage(last(query.notice), last(query.error));
  return (
    <AccountShell
      account={account}
      title="Beheeromgeving"
      intro="Beheer TOS-avonden en open per event het read-only deelnemersoverzicht."
    >
      {message ? (
        <p className={`${styles.message} ${message.tone === "success" ? styles.messageSuccess : styles.messageDanger}`} role={message.tone === "danger" ? "alert" : "status"}>
          {message.text}
        </p>
      ) : null}
      <div className={styles.layout}>
        <CreateTosEventForm />
        <TosEventList events={events} />
      </div>
    </AccountShell>
  );
}
