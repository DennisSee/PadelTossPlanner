import type { CSSProperties } from "react";

import type { EventCapacity } from "../../lib/tos/types";
import type { Sport } from "../ui";
import styles from "./tos.module.css";

export function EventCapacityPanel({
  capacity,
  sport,
  compact = false,
  hideFreePlaces = false,
}: {
  capacity: EventCapacity;
  sport: Sport;
  compact?: boolean;
  hideFreePlaces?: boolean;
}) {
  const occupied = capacity.placedCount;
  const percentage = Math.min(100, Math.round((occupied / capacity.maxParticipants) * 100));
  const style = { "--occupancy": `${percentage}%` } as CSSProperties;
  return (
    <div
      className={`${styles.capacityPanel} ${styles.capacityClarity} ${compact ? styles.capacityPanelCompact : ""}`.trim()}
      data-sport={sport}
      aria-label={`${occupied} van ${capacity.maxParticipants} plaatsen bezet`}
    >
      <div className={styles.capacityRing} style={style} aria-hidden="true" />
      <div className={styles.capacityNumbers}>
        <strong>{occupied} / {capacity.maxParticipants}</strong>
        <span>Plekken bezet</span>
      </div>
      {!hideFreePlaces || capacity.availableCount === 0 ? <p className={styles.capacityAvailability}>{capacity.availableCount === 0 ? <span className={styles.fullBadge}>Vol</span> : <>{capacity.availableCount} {capacity.availableCount === 1 ? "plek" : "plekken"} vrij</>}</p> : null}
      {capacity.waitlistCount ? (
        <p className={styles.waitlistCount}>{capacity.waitlistCount} op wachtlijst</p>
      ) : null}
    </div>
  );
}
