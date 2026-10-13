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
  const homeGroup = compact && hideFreePlaces;
  return (
    <div
      className={`${styles.capacityPanel} ${styles.capacityClarity} ${compact ? styles.capacityPanelCompact : ""} ${homeGroup ? styles.capacityHomeGroup : ""}`.trim()}
      data-sport={sport}
      aria-label={`${occupied} van ${capacity.maxParticipants} plaatsen bezet`}
    >
      <div className={styles.capacityRing} style={style} aria-hidden="true" />
      <div className={styles.capacityNumbers}>
        {homeGroup ? <div className={styles.capacityTotal}><strong>{occupied} / {capacity.maxParticipants}</strong>{capacity.availableCount === 0 ? <span className={styles.fullBadge}>Vol</span> : null}</div> : <strong>{occupied} / {capacity.maxParticipants}</strong>}
        <span>Plekken bezet</span>
        {homeGroup && capacity.waitlistCount > 0 ? <p className={styles.waitlistCount}>{capacity.waitlistCount} op wachtlijst</p> : null}
      </div>
      {!homeGroup && (!hideFreePlaces || capacity.availableCount === 0) ? <p className={styles.capacityAvailability}>{capacity.availableCount === 0 ? <span className={styles.fullBadge}>Vol</span> : <>{capacity.availableCount} {capacity.availableCount === 1 ? "plek" : "plekken"} vrij</>}</p> : null}
      {!homeGroup && capacity.waitlistCount ? (
        <p className={styles.waitlistCount}>{capacity.waitlistCount} op wachtlijst</p>
      ) : null}
    </div>
  );
}
