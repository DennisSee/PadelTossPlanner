import { notFound } from "next/navigation";

import { AccountShell } from "../../../components/account/account-shell";
import { MembershipPanel } from "../../../components/tos/membership-panel";
import { RegistrationForm } from "../../../components/tos/registration-form";
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
import type { OwnRegistration, TosEvent } from "../../../lib/tos/types";
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
    </Card>
  );
}

function RegistrationCard({ event, registration }: { event: TosEvent; registration: OwnRegistration | null }) {
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
      {eventAllowsSelfService(event) ? (
        <RegistrationForm
          slug={event.slug}
          initialResponse={registration?.response ?? "attending"}
          initialFrom={initialFrom}
          initialUntil={initialUntil}
          existing={Boolean(registration)}
        />
      ) : (
        <p className={styles.muted}>Deze aanmelding kan niet meer worden gewijzigd.</p>
      )}
    </Card>
  );
}

function AttendeeCard({ names, unavailable }: { names: readonly string[]; unavailable: boolean }) {
  return (
    <Card className={styles.attendeeCard}>
      <div className={styles.attendeeHeader}>
        <h2 className={styles.formTitle}>Wie doen er mee?</h2>
        {!unavailable ? <Badge tone="success">{names.length} {names.length === 1 ? "deelnemer" : "deelnemers"}</Badge> : null}
      </div>
      {unavailable ? (
        <p className={styles.muted}>De deelnemerslijst is tijdelijk niet beschikbaar.</p>
      ) : names.length ? (
        <p className={styles.attendeeNames}>{names.join(" · ")}</p>
      ) : (
        <p className={styles.muted}>Er zijn nog geen deelnemers zichtbaar.</p>
      )}
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
  let attendeeNames: string[] = [];
  let attendeeNamesUnavailable = false;
  if (account) {
    try {
      registration = await repository.ownRegistration(event.id, account.identity.userId);
    } catch {
      return <StateMessage title="Aanmelding tijdelijk niet beschikbaar"><p>Probeer het later opnieuw.</p></StateMessage>;
    }
    if (account.capabilities.canParticipate) {
      try {
        attendeeNames = await repository.attendeeNames(event.id);
      } catch {
        attendeeNamesUnavailable = true;
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
        <>
          <AttendeeCard names={attendeeNames} unavailable={attendeeNamesUnavailable} />
          <RegistrationCard event={event} registration={registration} />
        </>
      ) : (
        <MembershipPanel account={account} returnPath={path} />
      )}
    </div>
  );

  if (account) {
    return (
      <AccountShell account={account} title="TOS-avond" intro="Bekijk de avond en beheer je eigen aanmelding.">
        {content}
      </AccountShell>
    );
  }
  return (
    <main className={styles.publicPage}>
      <div className={styles.publicShell}>
        <div className={styles.publicTopbar}>
          <AppHeader subtitle="TOS-avond" />
          <SiteNavigation model={navigationModelFromAccount(null)} />
        </div>
        <div className={styles.publicContent}>{content}</div>
      </div>
    </main>
  );
}
