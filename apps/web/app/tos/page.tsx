import { AccountShell } from "../../components/account/account-shell";
import { TosEventCard } from "../../components/tos/event-card";
import { MembershipPanel } from "../../components/tos/membership-panel";
import { TosFilters } from "../../components/tos/tos-filters";
import styles from "../../components/tos/tos.module.css";
import { StateMessage } from "../../components/ui";
import { requireAccount } from "../../lib/auth/route-guard";
import { filterParticipantEvents, participantFilters } from "../../lib/tos/event-filters";
import { publicTosMessage } from "../../lib/tos/messages";
import { TosRepository } from "../../lib/tos/repository";
import { createServerSupabaseClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<{
  notice?: string | string[];
  error?: string | string[];
  status?: string | string[];
  sport?: string | string[];
}>;

function last(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.at(-1) : value;
}

async function loadDashboard(
  repository: TosRepository,
  userId: string,
  now: Date,
  filters: ReturnType<typeof participantFilters>,
) {
  const [registrations, participantEvents] = await Promise.all([
    repository.listOwnUpcomingRegistrations(userId, now),
    repository.listParticipantEvents(now),
  ]);
  const registrationByEvent = new Map(registrations.map((registration) => [registration.eventId, registration]));
  const events = filterParticipantEvents(participantEvents, filters, now);
  const snapshots = await Promise.all(events.map(async (event) => {
    const registration = registrationByEvent.get(event.id);
    const [capacity, attendanceResult, positionResult] = await Promise.all([
      repository.eventCapacity(event.id),
      repository.eventAttendance(event.id).then(
        (attendance) => ({ attendance, unavailable: false }),
        () => ({ attendance: [], unavailable: true }),
      ),
      registration
        ? repository.ownRegistrationPosition(event.id)
        : Promise.resolve(null),
    ]);
    return Object.freeze({
      event,
      registration,
      capacity,
      attendance: attendanceResult.attendance,
      socialDataUnavailable: attendanceResult.unavailable,
      registrationPosition: positionResult,
    });
  }));
  return { snapshots };
}

export default async function TosPage({ searchParams }: { searchParams: SearchParams }) {
  const client = await createServerSupabaseClient();
  const account = await requireAccount("/tos", client);
  const params = await searchParams;
  const message = publicTosMessage(last(params.notice), last(params.error));
  const filters = participantFilters(params);

  if (!account.capabilities.canParticipate) {
    return (
      <AccountShell
        account={account}
        title="TOS-avonden"
        intro="Bekijk je clubstatus en meld je daarna eenvoudig aan."
        variant="tos"
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
    dashboard = await loadDashboard(repository, account.identity.userId, now, filters);
  } catch {
    dashboard = null;
  }
  if (!dashboard) {
    return (
      <AccountShell
        account={account}
        title="TOS-avonden"
        intro="Bekijk en wijzig hier je eigen TOS-aanmeldingen."
        variant="tos"
      >
        <StateMessage title="TOS-avonden tijdelijk niet beschikbaar">
          <p>Probeer het later opnieuw.</p>
        </StateMessage>
      </AccountShell>
    );
  }
  const { snapshots } = dashboard;
  return (
    <AccountShell
      account={account}
      title="TOS-avonden"
      intro={`Hoi ${account.membership.displayName ?? account.profile?.displayName ?? "clublid"}. Bekijk en wijzig hier je TOS-aanmeldingen.`}
      variant="tos"
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
        <TosFilters status={filters.status} sport={filters.sport} resultCount={snapshots.length} />
        <section className={styles.section} aria-labelledby="available-tos">
          <div className={styles.sectionHeader}>
            <h2 id="available-tos">TOS-avonden</h2>
            <p>Bekijk capaciteit, deelnemers en je eigen aanmelding.</p>
          </div>
          {snapshots.length ? (
            <div className={styles.eventGrid}>
              {snapshots.map((snapshot) => (
                <TosEventCard key={snapshot.event.id} {...snapshot} now={now} />
              ))}
            </div>
          ) : (
            <p className={styles.muted}>Geen TOS-avonden gevonden met deze filters.</p>
          )}
        </section>
      </div>
    </AccountShell>
  );
}
