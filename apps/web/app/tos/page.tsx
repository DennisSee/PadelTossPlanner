import { AccountShell } from "../../components/account/account-shell";
import { TosEventCard } from "../../components/tos/event-card";
import { MembershipPanel } from "../../components/tos/membership-panel";
import { TosFilters } from "../../components/tos/tos-filters";
import styles from "../../components/tos/tos.module.css";
import { Badge, Card, EventDateRail, SportBadge, StateMessage } from "../../components/ui";
import { requireAccount } from "../../lib/auth/route-guard";
import { filterParticipantEvents, participantFilters } from "../../lib/tos/event-filters";
import { publicTosMessage } from "../../lib/tos/messages";
import { TosRepository } from "../../lib/tos/repository";
import { eventDisplayTitle, formatEventClock, formatEventDate } from "../../lib/tos/time";
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
    repository.listParticipantEvents(now, { includePast: filters.status === "past" || filters.status === "all" }),
  ]);
  const registrationByEvent = new Map(registrations.map((registration) => [registration.eventId, registration]));
  const events = filterParticipantEvents(participantEvents, filters, now);
  const snapshots = await Promise.all(events.map(async (event) => {
    // The existing social RPCs intentionally exclude past events. Keep this
    // overview on the safe event projection, not personal played-history data.
    if (new Date(event.endsAt) < now) return Object.freeze({ event, past: true as const });
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
      past: false as const,
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
      intro="Bekijk en beheer je TOS-aanmeldingen."
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
                snapshot.past ? (
                  <Card key={snapshot.event.id} className={styles.eventCard}>
                    <EventDateRail startsAt={snapshot.event.startsAt} accent="green" />
                    <div className={styles.eventBody}>
                      <div className={styles.badges}><SportBadge sport={snapshot.event.sport} compact /><Badge tone="neutral">Afgelopen</Badge></div>
                      <h3 className={styles.eventTitle}>{eventDisplayTitle(snapshot.event)}</h3>
                      <p className={styles.metadata}>{formatEventDate(snapshot.event.startsAt)} · {formatEventClock(snapshot.event.startsAt)}–{formatEventClock(snapshot.event.endsAt)}</p>
                    </div>
                  </Card>
                ) : <TosEventCard key={snapshot.event.id} {...snapshot} now={now} />
              ))}
            </div>
          ) : (
            <p className={styles.muted}>{({
              open: "Geen open TOS-avonden gevonden.",
              closed: "Geen TOS-avonden met gesloten inschrijving gevonden.",
              past: "Geen afgelopen TOS-avonden gevonden.",
              all: "Geen TOS-avonden gevonden met deze filters.",
            })[filters.status]}</p>
          )}
        </section>
      </div>
    </AccountShell>
  );
}
