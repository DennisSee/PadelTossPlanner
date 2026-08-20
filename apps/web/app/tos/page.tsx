import { AccountShell } from "../../components/account/account-shell";
import { TosEventCard } from "../../components/tos/event-card";
import { MembershipPanel } from "../../components/tos/membership-panel";
import styles from "../../components/tos/tos.module.css";
import { StateMessage } from "../../components/ui";
import { requireAccount } from "../../lib/auth/route-guard";
import { eventsWithoutOwnRegistration } from "../../lib/tos/dashboard";
import { publicTosMessage } from "../../lib/tos/messages";
import { TosRepository } from "../../lib/tos/repository";
import { createServerSupabaseClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<{
  notice?: string | string[];
  error?: string | string[];
}>;

function last(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.at(-1) : value;
}

async function loadDashboard(
  repository: TosRepository,
  userId: string,
  now: Date,
) {
  const [registrations, openEvents] = await Promise.all([
    repository.listOwnUpcomingRegistrations(userId, now),
    repository.listOpenEvents(now),
  ]);
  const unregisteredEvents = eventsWithoutOwnRegistration(openEvents, registrations);
  const attendeeResults = await Promise.allSettled(
    unregisteredEvents.map((event) => repository.attendeeNames(event.id)),
  );
  return { registrations, unregisteredEvents, attendeeResults };
}

export default async function TosPage({ searchParams }: { searchParams: SearchParams }) {
  const client = await createServerSupabaseClient();
  const account = await requireAccount("/tos", client);
  const params = await searchParams;
  const message = publicTosMessage(last(params.notice), last(params.error));

  if (!account.capabilities.canParticipate) {
    return (
      <AccountShell
        account={account}
        title="TOS-avonden"
        intro="Bekijk je clubstatus en meld je daarna eenvoudig aan."
      >
        <div className={styles.stack}>
          {message ? (
            <p
              className={`${styles.message} ${message.tone === "success" ? styles.messageSuccess : styles.messageDanger}`}
              role={message.tone === "danger" ? "alert" : "status"}
            >
              {message.text}
            </p>
          ) : null}
          <MembershipPanel account={account} />
        </div>
      </AccountShell>
    );
  }

  const repository = new TosRepository(client);
  const now = new Date();
  let dashboard: Awaited<ReturnType<typeof loadDashboard>> | null = null;
  try {
    dashboard = await loadDashboard(repository, account.identity.userId, now);
  } catch {
    dashboard = null;
  }
  if (!dashboard) {
    return (
      <AccountShell
        account={account}
        title="TOS-avonden"
        intro="Bekijk en wijzig hier je eigen TOS-aanmeldingen."
      >
        <StateMessage title="TOS-avonden tijdelijk niet beschikbaar">
          <p>Probeer het later opnieuw.</p>
        </StateMessage>
      </AccountShell>
    );
  }
  const { registrations, unregisteredEvents, attendeeResults } = dashboard;
  return (
    <AccountShell
      account={account}
      title="TOS-avonden"
      intro={`Hoi ${account.membership.displayName ?? account.profile?.displayName ?? "clublid"}. Bekijk en wijzig hier je TOS-aanmeldingen.`}
    >
      <div className={styles.stack}>
        {message ? (
          <p
            className={`${styles.message} ${message.tone === "success" ? styles.messageSuccess : styles.messageDanger}`}
            role={message.tone === "danger" ? "alert" : "status"}
          >
            {message.text}
          </p>
        ) : null}
        <section className={styles.section} aria-labelledby="my-upcoming-tos">
          <div className={styles.sectionHeader}>
            <h2 id="my-upcoming-tos">Mijn komende TOS</h2>
            <p>Je eigen aanmeldingen en afmeldingen, in chronologische volgorde.</p>
          </div>
          {registrations.length ? (
            <div className={styles.eventGrid}>
              {registrations.map((registration) => (
                <TosEventCard
                  key={registration.id}
                  event={registration.event}
                  registration={registration}
                  now={now}
                />
              ))}
            </div>
          ) : (
            <p className={styles.muted}>Je bent nog niet aangemeld voor een komende TOS.</p>
          )}
        </section>
        <section className={styles.section} aria-labelledby="available-tos">
          <div className={styles.sectionHeader}>
            <h2 id="available-tos">Nog aanmelden</h2>
            <p>Open TOS-avonden waarop je nog geen reactie hebt gegeven.</p>
          </div>
          {unregisteredEvents.length ? (
            <div className={styles.eventGrid}>
              {unregisteredEvents.map((event, index) => {
                const attendees = attendeeResults[index];
                return (
                  <TosEventCard
                    key={event.id}
                    event={event}
                    attendeeNames={attendees.status === "fulfilled" ? attendees.value : undefined}
                    attendeeNamesUnavailable={attendees.status === "rejected"}
                    now={now}
                  />
                );
              })}
            </div>
          ) : (
            <p className={styles.muted}>Geen andere open TOS-avonden.</p>
          )}
        </section>
      </div>
    </AccountShell>
  );
}
