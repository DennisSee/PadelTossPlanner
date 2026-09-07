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
  eventDisplayTitle,
  eventPresentationStatus,
  formatEventClock,
  formatEventDate,
} from "../../lib/tos/time";
import { Badge, Card, EventDateRail, LinkButton, SecondaryLinkButton, SportBadge } from "../ui";
import { EventCapacityPanel } from "./event-capacity";
import { ParticipantsSheet } from "./participants-sheet";

import styles from "./tos.module.css";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/u)
    .map((part) => part.match(/[\p{L}\p{N}]/gu)?.join("") ?? "")
    .filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}` : parts[0]?.slice(0, 2) ?? "?")
    .toLocaleUpperCase("nl-NL");
}

function compactNamesPreview(names: readonly string[]): string {
  const shown = names.slice(0, 2).join(", ");
  const remaining = names.length - Math.min(names.length, 2);
  return `${shown}${remaining > 0 ? ` +${remaining}` : ""}`;
}

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
  compact = false,
  actionOverride,
  now,
}: {
  event: TosEvent;
  registration?: OwnRegistration;
  capacity: EventCapacity;
  attendance: readonly ParticipantAttendance[];
  registrationPosition?: OwnRegistrationPosition | null;
  socialDataUnavailable?: boolean;
  compact?: boolean;
  actionOverride?: Readonly<{ href: string; label: string; status?: string }>;
  now: Date;
}) {
  const status = eventPresentationStatus(event, now);
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
    <Card className={`${styles.eventCard} ${compact ? styles.eventCardCompact : ""} ${event.sport === "padel" ? styles.eventCardPadel : styles.eventCardTennis} ${cardClass(event, registration)}`}>
      <EventDateRail startsAt={event.startsAt} accent={registration ? "green" : "yellow"} />
      <div className={styles.eventBody}>
        <div className={styles.badges}>
          <SportBadge sport={event.sport} compact />
          {!compact || !registration ? <span className={registration ? styles.secondaryEventStatus : undefined}><Badge tone={statusTone(event, now)}>{status}</Badge></span> : null}
          {registration ? (
            <Badge tone={registrationPosition?.placementStatus === "waitlist" ? "warning" : registration.response === "attending" ? "success" : "neutral"}>
              {personalLabel ?? (registration.response === "attending" ? "✓ Aangemeld" : "Afgemeld")}
            </Badge>
          ) : null}
        </div>
        <h3 className={styles.eventTitle}>{eventDisplayTitle(event)}</h3>
        <p className={styles.metadata}>
          {formatEventDate(event.startsAt)} · {formatEventClock(event.startsAt)}–{formatEventClock(event.endsAt)}
        </p>
        {availability && !compact ? <p className={styles.personalStatus}>Je doet mee · {availability}</p> : null}
        {event.signupDeadline ? (
          <p className={styles.deadline}>
            Inschrijven t/m {formatEventDate(event.signupDeadline)} · {formatEventClock(event.signupDeadline)}
          </p>
        ) : null}
        <EventCapacityPanel capacity={capacity} sport={event.sport} compact={compact} />
        <div className={styles.participantColumn}>
          {!socialDataUnavailable ? (
            <>
              {compact ? (
                <ParticipantsSheet
                  event={event}
                  capacity={capacity}
                  attendance={attendance}
                  triggerContent={(
                    <span className={styles.compactAttendeePreview}>
                      {placedNames.length ? (
                        <span className={styles.attendeeAvatars} aria-hidden="true">
                          {placedNames.slice(0, 3).map((name, index) => (
                            <span key={`${index}-${name}`}>{initials(name)}</span>
                          ))}
                        </span>
                      ) : null}
                      <span className={styles.attendeePreview}>
                        {placedNames.length ? compactNamesPreview(placedNames) : "Nog geen deelnemers"}
                      </span>
                      <strong className={styles.compactPeopleAction}>Bekijk <span aria-hidden="true">›</span></strong>
                    </span>
                  )}
                />
              ) : (
                <>
                  <p className={styles.attendeePreview}>
                    {placedNames.length} {placedNames.length === 1 ? "deelnemer" : "deelnemers"}
                    {placedNames.length ? ` · ${attendeeNamesPreview(placedNames)}` : ""}
                  </p>
                  <ParticipantsSheet event={event} capacity={capacity} attendance={attendance} />
                </>
              )}
            </>
          ) : (
            <p className={styles.attendeePreview}>
              De deelnemerslijst is tijdelijk niet beschikbaar.
            </p>
          )}
          <div className={styles.actions}>
            {actionOverride ? (
              <>
                <LinkButton href={actionOverride.href}>{actionOverride.label}</LinkButton>
                {actionOverride.status ? <p className={styles.muted}>{actionOverride.status}</p> : null}
              </>
            ) : registration && !canChange ? (
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
      </div>
    </Card>
  );
}
