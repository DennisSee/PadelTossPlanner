import { ActionDialog, Badge, Card, EventDateRail, SecondaryLinkButton } from "../ui";
import { createEventDefaults } from "../../lib/tos/staff-management";
import { tosDetailPath } from "../../lib/tos/slug";
import {
  eventPresentationStatus,
  formatEventClock,
  formatEventDate,
  formatEventDateTimeInput,
} from "../../lib/tos/time";
import type { StaffEventCapacity, TosEvent, TosEventStatus } from "../../lib/tos/types";

import styles from "./tos-event-management.module.css";
import { ResponsiveCreatePanel } from "./responsive-create-panel";

const STATUS_LABELS: Record<TosEventStatus, string> = {
  draft: "Concept",
  open: "Open voor inschrijving",
  closed: "Inschrijving gesloten",
  cancelled: "Geannuleerd",
};

function statusTone(status: TosEventStatus): "success" | "warning" | "danger" | "neutral" {
  if (status === "open") return "success";
  if (status === "draft") return "warning";
  if (status === "cancelled") return "danger";
  return "neutral";
}

export function CreateTosEventForm({ now = new Date() }: { now?: Date }) {
  const defaults = createEventDefaults(now);
  return (
    <Card className={styles.formCard}>
      <ResponsiveCreatePanel>
        <h2 className={styles.createTitle}>Nieuwe TOS</h2>
        <form className={styles.form} action="/api/beheer/tos/create" method="post">
        <label className={styles.field}>
          Titel
          <input name="title" maxLength={160} required defaultValue={defaults.title} />
        </label>
        <div className={styles.twoColumns}>
          <label className={styles.field}>
            Sport
            <select name="sport" defaultValue={defaults.sport}>
              <option value="padel">Padel</option>
              <option value="tennis">Tennis</option>
            </select>
          </label>
          <label className={styles.field}>
            Datum
            <input name="event_date" type="date" required defaultValue={defaults.eventDate} />
          </label>
        </div>
        <div className={styles.twoColumns}>
          <label className={styles.field}>
            Starttijd
            <input name="starts_at" type="time" step={60} required defaultValue={defaults.startsAt} />
          </label>
          <label className={styles.field}>
            Eindtijd
            <input name="ends_at" type="time" step={60} required defaultValue={defaults.endsAt} />
          </label>
        </div>
        <label className={styles.field}>
          Inschrijfdeadline <span className={styles.optional}>(optioneel)</span>
          <input name="signup_deadline" type="datetime-local" step={60} defaultValue={defaults.signupDeadline} />
        </label>
        <label className={styles.field}>
          Maximaal aantal deelnemers
          <input name="max_participants" type="number" min={1} max={500} step={1} required defaultValue={defaults.maxParticipants} />
        </label>
        <label className={styles.field}>
          Initiële status
          <select name="status" defaultValue={defaults.status}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
          <button className={styles.primaryButton} type="submit">TOS-avond aanmaken</button>
        </form>
      </ResponsiveCreatePanel>
    </Card>
  );
}

function EventCard({ event, capacity }: { event: TosEvent; capacity: StaffEventCapacity }) {
  const presentation = eventPresentationStatus(event);
  const publicNote = event.status === "open"
    ? "Dit event is publiek zichtbaar via de eventpagina."
    : "Deze status is niet publiek zichtbaar; staff kan de eventpagina wel bekijken.";
  return (
    <Card className={styles.eventCard}>
      <div className={styles.eventSummary}>
        <EventDateRail startsAt={event.startsAt} accent={event.status === "draft" ? "yellow" : "green"} />
        <div className={styles.eventMain}>
          <div className={styles.badges}>
            <Badge tone="neutral">{event.sport.toUpperCase()}</Badge>
            <Badge tone={statusTone(event.status)}>{STATUS_LABELS[event.status]}</Badge>
          </div>
          <h3>{event.title}</h3>
          <p className={styles.dateTime}>
            {formatEventDate(event.startsAt)} · {formatEventClock(event.startsAt)}–{formatEventClock(event.endsAt)}
          </p>
          <dl className={styles.details}>
            <dt>Deadline</dt>
            <dd>{event.signupDeadline ? `${formatEventDate(event.signupDeadline)} · ${formatEventClock(event.signupDeadline)}` : "Geen deadline"}</dd>
            <dt>Eventlink</dt>
            <dd><code>{tosDetailPath(event.slug)}</code></dd>
          </dl>
          <p className={styles.publicNote}>{publicNote}</p>
          {presentation !== STATUS_LABELS[event.status] ? (
            <p className={styles.presentationNote}>{presentation}</p>
          ) : null}
          <div className={styles.eventActions}>
            <SecondaryLinkButton href={`/beheer/tos/${event.slug}`}>TOS-avond beheren</SecondaryLinkButton>
            <SecondaryLinkButton href={tosDetailPath(event.slug)}>Eventpagina bekijken</SecondaryLinkButton>
            <ActionDialog
              triggerLabel="Eventgegevens wijzigen"
              title="Eventgegevens wijzigen"
              description={`${event.title} · ${formatEventDate(event.startsAt)}`}
              triggerClassName={styles.editTrigger}
            >
              <form className={styles.editForm} action="/api/beheer/tos/update" method="post">
                <input type="hidden" name="slug" value={event.slug} />
                <label className={styles.field}>
                  Titel
                  <input name="title" maxLength={160} required defaultValue={event.title} data-dialog-initial />
                </label>
                <label className={styles.field}>
                  Inschrijfdeadline <span className={styles.optional}>(leeg = geen deadline)</span>
                  <input
                    name="signup_deadline"
                    type="datetime-local"
                    step={60}
                    defaultValue={event.signupDeadline ? formatEventDateTimeInput(event.signupDeadline) : ""}
                  />
                </label>
                <label className={styles.field}>
                  Maximaal aantal deelnemers
                  <input name="max_participants" type="number" min={1} max={500} step={1} required defaultValue={event.maxParticipants} />
                </label>
                <label className={styles.field}>
                  Status
                  <select name="status" defaultValue={event.status}>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <p className={styles.immutableNote}>
                  Sport, datum, tijden en slug blijven na aanmaken ongewijzigd.
                </p>
                <button className={styles.primaryEditButton} type="submit">Wijzigingen opslaan</button>
              </form>
            </ActionDialog>
          </div>
        </div>
        <div className={`${styles.capacitySummary} ${capacity.availableCount === 0 ? styles.capacityFull : ""}`}>
          <strong>{capacity.placedCount} / {capacity.maxParticipants}</strong>
          <span>plekken bezet</span>
          <p>{capacity.availableCount} {capacity.availableCount === 1 ? "plek" : "plekken"} vrij</p>
          {capacity.waitlistCount ? <small>{capacity.waitlistCount} op wachtlijst</small> : null}
        </div>
      </div>
    </Card>
  );
}

export function TosEventList({
  events,
  capacityByEvent,
}: {
  events: readonly TosEvent[];
  capacityByEvent: ReadonlyMap<string, StaffEventCapacity>;
}) {
  return (
    <section className={styles.section} aria-labelledby="tos-events-heading">
      <div className={styles.sectionHeader}>
        <h2 id="tos-events-heading">TOS-avonden</h2>
        <p>Alle concept-, open, gesloten, geannuleerde en afgelopen events.</p>
      </div>
      {events.length ? (
        <div className={styles.eventGrid}>
          {events.map((event) => {
            const capacity = capacityByEvent.get(event.id);
            return capacity ? <EventCard key={event.id} event={event} capacity={capacity} /> : null;
          })}
        </div>
      ) : (
        <p className={styles.empty}>Er zijn nog geen TOS-avonden aangemaakt.</p>
      )}
    </section>
  );
}
