import { notFound } from "next/navigation";

import { AccountShell } from "../../../components/account/account-shell";
import { MembershipPanel } from "../../../components/tos/membership-panel";
import { RegistrationForm } from "../../../components/tos/registration-form";
import { EventCapacityPanel } from "../../../components/tos/event-capacity";
import { ParticipantsSheet } from "../../../components/tos/participants-sheet";
import styles from "../../../components/tos/tos.module.css";
import {
  AppHeader,
  Badge,
  Card,
  LinkButton,
  navigationModelFromAccount,
  SiteNavigation,
  StateMessage,
} from "../../../components/ui";
import { loginPathFor } from "../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../lib/auth/session";
import { publicTosMessage } from "../../../lib/tos/messages";
import { TosDataUnavailableError, TosRepository } from "../../../lib/tos/repository";
import { isTosEventSlug, tosDetailPath } from "../../../lib/tos/slug";
import {
  eventAllowsSelfService,
  eventPresentationStatus,
  formatEventClock,
  formatEventDate,
  fullEventAvailability,
} from "../../../lib/tos/time";
import type {
  EventCapacity,
  OwnRegistration,
  OwnRegistrationPosition,
  ParticipantAttendance,
  TosEvent,
} from "../../../lib/tos/types";
import { createServerSupabaseClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    notice?: string | string[];
    error?: string | string[];
  }>;
};

function last(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.at(-1) : value;
}

function eventStatusTone(event: TosEvent): "success" | "warning" | "danger" | "neutral" {
  const presentation = eventPresentationStatus(event);
  if (presentation === "Geannuleerd") return "danger";
  if (presentation === "Open voor inschrijving") return "success";
  if (presentation === "Concept") return "warning";
  return "neutral";
}

function EventSummary({ event, heading = "h2" }: { event: TosEvent; heading?: "h1" | "h2" }) {
  const Heading = heading;
  return (
    <Card className={styles.eventHero}>
      <div className={styles.badges}>
        <Badge tone="neutral">{event.sport.toUpperCase()}</Badge>
        <Badge tone={eventStatusTone(event)}>{eventPresentationStatus(event)}</Badge>
      </div>
      <Heading className={styles.eventTitle}>{event.title}</Heading>
      <p className={styles.metadata}>
        {formatEventDate(event.startsAt)} · {formatEventClock(event.startsAt)}–{formatEventClock(event.endsAt)}
      </p>
      {event.signupDeadline ? (
        <p className={styles.deadline}>
          Inschrijven t/m {formatEventDate(event.signupDeadline)} · {formatEventClock(event.signupDeadline)}
        </p>
      ) : null}
      <p className={styles.deadline}>Maximaal {event.maxParticipants} deelnemers</p>
    </Card>
  );
}

function RegistrationCard({
  event,
  registration,
  capacity,
  position,
}: {
  event: TosEvent;
  registration: OwnRegistration | null;
  capacity: EventCapacity;
  position: OwnRegistrationPosition | null;
}) {
  const defaults = fullEventAvailability(event);
  const initialFrom = registration?.response === "attending"
    ? formatEventClock(registration.availableFrom!)
    : defaults.from;
  const initialUntil = registration?.response === "attending"
    ? formatEventClock(registration.availableUntil!)
    : defaults.until;
  return (
    <Card className={styles.formCard}>
      <h2 className={styles.formTitle}>{registration ? "Mijn aanmelding" : "Aanmelden"}</h2>
      {position?.placementStatus === "placed" ? (
        <p className={styles.personalStatus}>Je bent geplaatst.</p>
      ) : position?.placementStatus === "waitlist" ? (
        <p className={styles.waitlistNotice}>Je staat op plek {position.waitlistPosition} van de wachtlijst.</p>
      ) : position?.placementStatus === "declined" ? (
        <p className={styles.muted}>Je bent afgemeld.</p>
      ) : null}
      {eventAllowsSelfService(event) ? (
        <RegistrationForm
          slug={event.slug}
          initialResponse={registration?.response ?? "attending"}
          initialFrom={initialFrom}
          initialUntil={initialUntil}
          existing={Boolean(registration)}
          waitlistExpected={!registration && capacity.availableCount === 0}
        />
      ) : (
        <p className={styles.muted}>Deze aanmelding kan niet meer worden gewijzigd.</p>
      )}
    </Card>
  );
}

function AttendeeCard({
  event,
  capacity,
  attendance,
  unavailable,
}: {
  event: TosEvent;
  capacity: EventCapacity;
  attendance: readonly ParticipantAttendance[];
  unavailable: boolean;
}) {
  const placed = attendance.filter((person) => person.placementStatus === "placed");
  return (
    <Card className={styles.attendeeCard}>
      <div className={styles.attendeeHeader}>
        <h2 className={styles.formTitle}>Wie doen er mee?</h2>
        {!unavailable ? <Badge tone="success">{placed.length} {placed.length === 1 ? "deelnemer" : "deelnemers"}</Badge> : null}
      </div>
      <EventCapacityPanel capacity={capacity} />
      {unavailable ? (
        <p className={styles.muted}>De deelnemerslijst is tijdelijk niet beschikbaar.</p>
      ) : placed.length ? (
        <p className={styles.attendeeNames}>{placed.map((person) => person.displayName).join(" · ")}</p>
      ) : (
        <p className={styles.muted}>Er zijn nog geen deelnemers zichtbaar.</p>
      )}
      {!unavailable ? <ParticipantsSheet event={event} capacity={capacity} attendance={attendance} /> : null}
    </Card>
  );
}

export default async function TosDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  if (!isTosEventSlug(slug)) notFound();
  const path = tosDetailPath(slug);
  let client;
  try {
    client = await createServerSupabaseClient();
  } catch {
    return <StateMessage title="TOS-avond tijdelijk niet beschikbaar"><p>Probeer het later opnieuw.</p></StateMessage>;
  }

  let account = null;
  try {
    account = await loadAccountContextWithClient(client);
  } catch {
    account = null;
  }
  const repository = new TosRepository(client);
  let event: TosEvent | null;
  try {
    event = await repository.eventBySlug(slug, { openOnly: !account });
  } catch (error) {
    if (error instanceof TosDataUnavailableError) {
      return <StateMessage title="TOS-avond tijdelijk niet beschikbaar"><p>Probeer het later opnieuw.</p></StateMessage>;
    }
    throw error;
  }
  if (!event) notFound();

  let registration: OwnRegistration | null = null;
  let capacity: EventCapacity | null = null;
  let attendance: ParticipantAttendance[] = [];
  let registrationPosition: OwnRegistrationPosition | null = null;
  let attendeeNamesUnavailable = false;
  if (account) {
    try {
      registration = await repository.ownRegistration(event.id, account.identity.userId);
    } catch {
      return <StateMessage title="Aanmelding tijdelijk niet beschikbaar"><p>Probeer het later opnieuw.</p></StateMessage>;
    }
    if (account.capabilities.canParticipate) {
      try {
        [capacity, attendance, registrationPosition] = await Promise.all([
          repository.eventCapacity(event.id),
          repository.eventAttendance(event.id),
          registration ? repository.ownRegistrationPosition(event.id) : Promise.resolve(null),
        ]);
      } catch {
        attendeeNamesUnavailable = true;
        capacity = null;
      }
    }
  }
  const query = await searchParams;
  const message = publicTosMessage(last(query.notice), last(query.error));
  const content = (
    <div className={styles.stack}>
      {message ? (
        <p
          className={`${styles.message} ${message.tone === "success" ? styles.messageSuccess : styles.messageDanger}`}
          role={message.tone === "danger" ? "alert" : "status"}
        >{message.text}</p>
      ) : null}
      <EventSummary event={event} heading={account ? "h2" : "h1"} />
      {!account ? (
        <Card className={styles.formCard}>
          <h2 className={styles.formTitle}>Zelf aanmelden</h2>
          <p className={styles.muted}>Log in om je eigen aanmelding te bekijken of op te slaan.</p>
          <div className={styles.actions}><LinkButton href={loginPathFor(path)}>Inloggen / aanmelden</LinkButton></div>
        </Card>
      ) : account.capabilities.canParticipate ? (
        capacity ? (
          <>
            <AttendeeCard event={event} capacity={capacity} attendance={attendance} unavailable={attendeeNamesUnavailable} />
            <RegistrationCard event={event} registration={registration} capacity={capacity} position={registrationPosition} />
          </>
        ) : <StateMessage title="Capaciteit tijdelijk niet beschikbaar"><p>Probeer het later opnieuw.</p></StateMessage>
      ) : (
        <MembershipPanel account={account} returnPath={path} />
      )}
    </div>
  );

  if (account) {
    return (
      <AccountShell account={account} title="TOS-avond" intro="Bekijk de avond en beheer je eigen aanmelding." variant="tos">
        {content}
      </AccountShell>
    );
  }
  return (
    <main className={styles.publicPage}>
      <div className={styles.publicShell}>
        <div className={styles.publicTopbar}>
          <AppHeader subtitle="TOS-avond" />
          <SiteNavigation model={navigationModelFromAccount(null)} currentPath="/tos" />
        </div>
        <div className={styles.publicContent}>{content}</div>
      </div>
    </main>
  );
}
