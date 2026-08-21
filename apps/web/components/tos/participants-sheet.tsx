"use client";

import { useRef } from "react";

import type { EventCapacity, ParticipantAttendance, TosEvent } from "../../lib/tos/types";
import { formatEventClock, formatEventDate } from "../../lib/tos/time";
import styles from "./tos.module.css";

function initials(name: string): string {
  return name.trim().split(/\s+/u).slice(0, 2).map((part) => Array.from(part)[0] ?? "").join("").toLocaleUpperCase("nl-NL");
}

function PeopleList({ people, waiting = false }: { people: readonly ParticipantAttendance[]; waiting?: boolean }) {
  return people.length ? (
    <ol className={styles.peopleList}>
      {people.map((person) => (
        <li key={`${person.placementStatus}-${person.waitlistPosition ?? 0}-${person.displayName}`}>
          <span className={styles.personAvatar} aria-hidden="true">
            {waiting ? person.waitlistPosition : initials(person.displayName)}
          </span>
          <span>{person.displayName}</span>
        </li>
      ))}
    </ol>
  ) : <p className={styles.muted}>{waiting ? "De wachtlijst is leeg." : "Er zijn nog geen deelnemers."}</p>;
}

export function ParticipantsSheet({
  event,
  capacity,
  attendance,
}: {
  event: TosEvent;
  capacity: EventCapacity;
  attendance: readonly ParticipantAttendance[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const placed = attendance.filter((person) => person.placementStatus === "placed");
  const waiting = attendance.filter((person) => person.placementStatus === "waitlist");
  return (
    <>
      <button className={styles.peopleTrigger} type="button" onClick={() => dialog.current?.showModal()}>
        Bekijk deelnemers <span aria-hidden="true">›</span>
      </button>
      <dialog className={styles.peopleDialog} ref={dialog} aria-labelledby={`people-${event.id}`}>
        <div className={styles.dialogHandle} aria-hidden="true" />
        <header className={styles.dialogHeader}>
          <div>
            <p className={styles.dialogEyebrow}>Deelnemers</p>
            <h2 id={`people-${event.id}`}>{event.title}</h2>
            <p>{formatEventDate(event.startsAt)} · {formatEventClock(event.startsAt)}–{formatEventClock(event.endsAt)}</p>
          </div>
          <form method="dialog"><button aria-label="Sluiten" type="submit">×</button></form>
        </header>
        <div className={styles.dialogCapacity}>
          <strong>{capacity.placedCount} / {capacity.maxParticipants}</strong>
          <span>{capacity.availableCount} {capacity.availableCount === 1 ? "plek" : "plekken"} vrij</span>
        </div>
        <section>
          <h3>Deelnemers ({placed.length})</h3>
          <PeopleList people={placed} />
        </section>
        {capacity.waitlistCount ? (
          <section className={styles.waitlistSection}>
            <h3>Wachtlijst ({capacity.waitlistCount})</h3>
            <PeopleList people={waiting} waiting />
          </section>
        ) : null}
        <form method="dialog" className={styles.dialogClose}>
          <button type="submit">Sluiten</button>
        </form>
      </dialog>
    </>
  );
}
