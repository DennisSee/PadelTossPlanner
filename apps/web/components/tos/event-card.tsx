import { attendeeNamesPreview } from "../../lib/tos/dashboard";
import type { OwnRegistration, TosEvent } from "../../lib/tos/types";
import {
  eventAllowsSelfService,
  eventPresentationStatus,
  formatEventClock,
  formatEventDate,
} from "../../lib/tos/time";
import { Badge, Card, EventDateRail, LinkButton, SecondaryLinkButton } from "../ui";

import styles from "./tos.module.css";

function statusTone(event: TosEvent, now: Date): "success" | "warning" | "danger" | "neutral" {
  const presentation = eventPresentationStatus(event, now);
  if (presentation === "Geannuleerd") return "danger";
  if (presentation === "Open voor inschrijving") return "success";
  if (presentation === "Concept") return "warning";
  return "neutral";
}

function cardClass(event: TosEvent, registration?: OwnRegistration): string {
  if (event.status === "cancelled") return styles.eventCardCancelled;
  if (registration) return styles.eventCardRegistered;
  if (event.status === "open") return styles.eventCardOpen;
  return styles.eventCardClosed;
}

export function TosEventCard({
  event,
  registration,
  attendeeNames,
  attendeeNamesUnavailable = false,
  now,
}: {
  event: TosEvent;
  registration?: OwnRegistration;
  attendeeNames?: readonly string[];
  attendeeNamesUnavailable?: boolean;
  now: Date;
}) {
  const status = eventPresentationStatus(event, now);
  const canChange = eventAllowsSelfService(event, now);
  const availability = registration?.response === "attending"
    ? `${formatEventClock(registration.availableFrom!)}–${formatEventClock(registration.availableUntil!)}`
    : null;
  return (
    <Card className={`${styles.eventCard} ${cardClass(event, registration)}`}>
      <EventDateRail startsAt={event.startsAt} accent={registration ? "green" : "yellow"} />
      <div className={styles.eventBody}>
        <div className={styles.badges}>
          <Badge tone="neutral">{event.sport.toUpperCase()}</Badge>
          <Badge tone={statusTone(event, now)}>{status}</Badge>
          {registration ? (
            <Badge tone={registration.response === "attending" ? "success" : "neutral"}>
              {registration.response === "attending" ? "✓ Aangemeld" : "Afgemeld"}
            </Badge>
          ) : null}
        </div>
        <h3 className={styles.eventTitle}>{event.title}</h3>
        <p className={styles.metadata}>
          {formatEventDate(event.startsAt)} · {formatEventClock(event.startsAt)}–{formatEventClock(event.endsAt)}
        </p>
        {availability ? <p className={styles.personalStatus}>Je doet mee · {availability}</p> : null}
        {event.signupDeadline ? (
          <p className={styles.deadline}>
            Inschrijven t/m {formatEventDate(event.signupDeadline)} · {formatEventClock(event.signupDeadline)}
          </p>
        ) : null}
        {attendeeNames ? (
          <p className={styles.attendeePreview}>
            {attendeeNames.length} {attendeeNames.length === 1 ? "deelnemer" : "deelnemers"}
            {attendeeNames.length ? ` · ${attendeeNamesPreview(attendeeNames)}` : ""}
          </p>
        ) : null}
        {attendeeNamesUnavailable ? (
          <p className={styles.attendeePreview}>De deelnemerslijst is tijdelijk niet beschikbaar.</p>
        ) : null}
        <div className={styles.actions}>
          {registration && !canChange ? (
            <>
              <SecondaryLinkButton href={`/tos/${event.slug}`}>
                Aanmelding bekijken
              </SecondaryLinkButton>
              <p className={styles.muted}>Deze aanmelding kan niet meer worden gewijzigd.</p>
            </>
          ) : (
            <LinkButton href={`/tos/${event.slug}`}>
              {registration ? "Aanmelding wijzigen" : "Aanmelden"}
            </LinkButton>
          )}
        </div>
      </div>
    </Card>
  );
}
