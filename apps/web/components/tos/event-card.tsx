import { attendeeNamesPreview } from "../../lib/tos/dashboard";
import type {
  EventCapacity,
  OwnRegistration,
  OwnRegistrationPosition,
  ParticipantAttendance,
  TosEvent,
} from "../../lib/tos/types";
import {
  eventAllowsSelfService,
  eventPresentationStatus,
  formatEventClock,
  formatEventDate,
} from "../../lib/tos/time";
import { Badge, Card, EventDateRail, LinkButton, SecondaryLinkButton, SportBadge } from "../ui";
import { EventCapacityPanel } from "./event-capacity";
import { ParticipantsSheet } from "./participants-sheet";

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
  capacity,
  attendance,
  registrationPosition,
  socialDataUnavailable = false,
  now,
}: {
  event: TosEvent;
  registration?: OwnRegistration;
  capacity: EventCapacity;
  attendance: readonly ParticipantAttendance[];
  registrationPosition?: OwnRegistrationPosition | null;
  socialDataUnavailable?: boolean;
  now: Date;
}) {
  const status = eventPresentationStatus(event, now);
  const sportTitle = event.sport === "padel" ? "Padel TOS-avond" : "Tennis TOS-avond";
  const showCustomTitle = event.title.trim().toLocaleLowerCase("nl-NL") !== "tos-avond";
  const canChange = eventAllowsSelfService(event, now);
  const availability = registration?.response === "attending"
    ? `${formatEventClock(registration.availableFrom!)}–${formatEventClock(registration.availableUntil!)}`
    : null;
  const placedNames = attendance
    .filter((person) => person.placementStatus === "placed")
    .map((person) => person.displayName);
  const personalLabel = registrationPosition?.placementStatus === "waitlist"
    ? `Wachtlijst · plek ${registrationPosition.waitlistPosition}`
    : registrationPosition?.placementStatus === "placed"
      ? "✓ Geplaatst"
      : registration?.response === "declined"
        ? "Afgemeld"
        : null;
  return (
    <Card className={`${styles.eventCard} ${event.sport === "padel" ? styles.eventCardPadel : styles.eventCardTennis} ${cardClass(event, registration)}`}>
      <EventDateRail startsAt={event.startsAt} accent={registration ? "green" : "yellow"} />
      <div className={styles.eventBody}>
        <div className={styles.badges}>
          <SportBadge sport={event.sport} />
          <Badge tone={statusTone(event, now)}>{status}</Badge>
          {registration ? (
            <Badge tone={registrationPosition?.placementStatus === "waitlist" ? "warning" : registration.response === "attending" ? "success" : "neutral"}>
              {personalLabel ?? (registration.response === "attending" ? "✓ Aangemeld" : "Afgemeld")}
            </Badge>
          ) : null}
        </div>
        <h3 className={styles.eventTitle}>{sportTitle}</h3>
        {showCustomTitle ? <p className={styles.eventCustomTitle}>{event.title}</p> : null}
        <p className={styles.metadata}>
          {formatEventDate(event.startsAt)} · {formatEventClock(event.startsAt)}–{formatEventClock(event.endsAt)}
        </p>
        {availability ? <p className={styles.personalStatus}>Je doet mee · {availability}</p> : null}
        {event.signupDeadline ? (
          <p className={styles.deadline}>
            Inschrijven t/m {formatEventDate(event.signupDeadline)} · {formatEventClock(event.signupDeadline)}
          </p>
        ) : null}
        <EventCapacityPanel capacity={capacity} sport={event.sport} />
        {!socialDataUnavailable ? (
          <>
            <p className={styles.attendeePreview}>
              {placedNames.length} {placedNames.length === 1 ? "deelnemer" : "deelnemers"}
              {placedNames.length ? ` · ${attendeeNamesPreview(placedNames)}` : ""}
            </p>
            <ParticipantsSheet event={event} capacity={capacity} attendance={attendance} />
          </>
        ) : (
          <p className={styles.attendeePreview}>De deelnemerslijst is tijdelijk niet beschikbaar.</p>
        )}
        <div className={styles.actions}>
          {registration && !canChange ? (
            <>
              <SecondaryLinkButton href={`/tos/${event.slug}`}>
                Aanmelding bekijken
              </SecondaryLinkButton>
              <p className={styles.muted}>Deze aanmelding kan niet meer worden gewijzigd.</p>
            </>
          ) : canChange ? (
            <LinkButton href={`/tos/${event.slug}`}>
              {registration
                ? "Aanmelding wijzigen"
                : capacity.availableCount === 0
                  ? "Op wachtlijst"
                  : "Aanmelden"}
            </LinkButton>
          ) : (
            <button className={styles.disabledAction} type="button" disabled>
              Inschrijving gesloten
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
