import {
  assessStaffPlannerInput,
  availabilityLabel,
  PLANNER_READINESS,
  readinessLabel,
  type AssessedStaffPlannerInput,
  type PlannerReadiness,
} from "../../lib/tos/planner-readiness";
import { tosDetailPath } from "../../lib/tos/slug";
import {
  eventPresentationStatus,
  formatEventClock,
  formatEventDate,
} from "../../lib/tos/time";
import type { StaffPlannerInput, TosEvent } from "../../lib/tos/types";
import { Badge, Card, SecondaryLinkButton } from "../ui";

import styles from "./tos-event-participants.module.css";

function eventStatusTone(event: TosEvent): "success" | "warning" | "danger" | "neutral" {
  if (event.status === "open") return "success";
  if (event.status === "draft") return "warning";
  if (event.status === "cancelled") return "danger";
  return "neutral";
}

function readinessTone(readiness: PlannerReadiness): "success" | "warning" | "danger" | "neutral" {
  if (readiness === PLANNER_READINESS.READY) return "success";
  if (readiness === PLANNER_READINESS.DECLINED) return "neutral";
  if (readiness === PLANNER_READINESS.APPROVAL_PENDING) return "warning";
  return "danger";
}

function EventContext({ event }: { event: TosEvent }) {
  return (
    <Card className={styles.eventCard}>
      <div className={styles.badges}>
        <Badge tone="neutral">{event.sport.toUpperCase()}</Badge>
        <Badge tone={eventStatusTone(event)}>{eventPresentationStatus(event)}</Badge>
      </div>
      <h2>{event.title}</h2>
      <p className={styles.eventTime}>
        {formatEventDate(event.startsAt)} · {formatEventClock(event.startsAt)}–{formatEventClock(event.endsAt)}
      </p>
      <p className={styles.deadline}>
        Inschrijfdeadline: {event.signupDeadline
          ? `${formatEventDate(event.signupDeadline)} · ${formatEventClock(event.signupDeadline)}`
          : "geen deadline"}
      </p>
      <div className={styles.actions}>
        <SecondaryLinkButton href="/beheer">← Terug naar beheer</SecondaryLinkButton>
        <SecondaryLinkButton href={tosDetailPath(event.slug)}>Eventpagina bekijken</SecondaryLinkButton>
      </div>
    </Card>
  );
}

function Summary({ event, assessed }: { event: TosEvent; assessed: readonly AssessedStaffPlannerInput[] }) {
  const attending = assessed.filter(({ participant }) => participant.response === "attending");
  const declined = assessed.length - attending.length;
  const ready = attending.filter(({ readiness }) => readiness === PLANNER_READINESS.READY).length;
  const metrics = [
    ["Totaal reacties", assessed.length],
    ["Doet mee", attending.length],
    ["Afgemeld", declined],
    ...(event.sport === "padel"
      ? [["Klaar voor planner", ready], ["Aandacht nodig", attending.length - ready]]
      : []),
  ] as const;
  return (
    <section className={styles.summary} aria-label="Deelnemerssamenvatting">
      {metrics.map(([label, value]) => (
        <Card className={styles.metric} key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
        </Card>
      ))}
    </section>
  );
}

function ParticipantRow({ event, item }: { event: TosEvent; item: AssessedStaffPlannerInput }) {
  const { participant, readiness } = item;
  const levelLabel = event.sport === "padel" ? "Padelniveau" : "Tennisniveau";
  return (
    <li className={styles.participantRow}>
      <div className={styles.participantHeading}>
        <strong>{participant.displayName}</strong>
        <Badge tone={readinessTone(readiness)}>{readinessLabel(readiness, event.sport)}</Badge>
      </div>
      {participant.response === "attending" ? (
        <dl className={styles.participantDetails}>
          <dt>Beschikbaarheid</dt>
          <dd>{availabilityLabel(event, participant)}</dd>
          <dt>{levelLabel}</dt>
          <dd>{participant.ranking ?? "Ontbreekt"}</dd>
        </dl>
      ) : null}
    </li>
  );
}

function ParticipantGroup({
  event,
  title,
  items,
  empty,
}: {
  event: TosEvent;
  title: string;
  items: readonly AssessedStaffPlannerInput[];
  empty: string;
}) {
  return (
    <Card className={styles.groupCard}>
      <h2>{title}</h2>
      {items.length ? (
        <ul className={styles.participantList}>
          {items.map((item) => (
            <ParticipantRow event={event} item={item} key={item.participant.registrationId} />
          ))}
        </ul>
      ) : <p className={styles.empty}>{empty}</p>}
    </Card>
  );
}

function PlannerInputPreview({
  event,
  assessed,
}: {
  event: TosEvent;
  assessed: readonly AssessedStaffPlannerInput[];
}) {
  if (event.sport === "tennis") {
    return (
      <Card className={styles.previewCard}>
        <h2>Plannerinput</h2>
        <p className={styles.empty}>Tennisplanner wordt in een volgende stap toegevoegd.</p>
      </Card>
    );
  }
  const ready = assessed.filter(({ participant, readiness }) =>
    participant.response === "attending" && readiness === PLANNER_READINESS.READY);
  return (
    <Card className={styles.previewCard}>
      <div>
        <h2>Plannerinput</h2>
        <p className={styles.previewIntro}>Read-only preview van deelnemers die nu geldige padelplannerinput opleveren.</p>
      </div>
      {ready.length ? (
        <ul className={styles.previewList}>
          {ready.map(({ participant }) => (
            <li key={participant.registrationId}>
              <strong>{participant.displayName}</strong>
              <span>Padelniveau {participant.ranking}</span>
              <span>{availabilityLabel(event, participant)}</span>
            </li>
          ))}
        </ul>
      ) : <p className={styles.empty}>Nog niemand is klaar voor de padelplanner.</p>}
    </Card>
  );
}

export function TosEventParticipants({
  event,
  participants,
}: {
  event: TosEvent;
  participants: readonly StaffPlannerInput[] | null;
}) {
  if (participants === null) {
    return (
      <div className={styles.stack}>
        <EventContext event={event} />
        <Card className={styles.errorCard}>
          <h2>Deelnemers zijn tijdelijk niet beschikbaar</h2>
          <p>Probeer het later opnieuw.</p>
        </Card>
      </div>
    );
  }
  const assessed = assessStaffPlannerInput(event, participants);
  const attending = assessed.filter(({ participant }) => participant.response === "attending");
  const declined = assessed.filter(({ participant }) => participant.response === "declined");
  return (
    <div className={styles.stack}>
      <EventContext event={event} />
      <Summary event={event} assessed={assessed} />
      <div className={styles.groups}>
        <ParticipantGroup event={event} title="Doet mee" items={attending} empty="Nog niemand heeft zich aangemeld." />
        <ParticipantGroup event={event} title="Afgemeld" items={declined} empty="Niemand heeft zich afgemeld." />
      </div>
      <PlannerInputPreview event={event} assessed={assessed} />
    </div>
  );
}
