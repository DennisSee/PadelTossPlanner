import type { CSSProperties } from "react";

import type { EventCapacity } from "../../lib/tos/types";
import styles from "./tos.module.css";

export function EventCapacityPanel({ capacity }: { capacity: EventCapacity }) {
  const occupied = capacity.placedCount;
  const percentage = Math.min(100, Math.round((occupied / capacity.maxParticipants) * 100));
  const style = { "--occupancy": `${percentage}%` } as CSSProperties;
  return (
    <div
      className={`${styles.capacityPanel} ${capacity.availableCount === 0 ? styles.capacityFull : ""}`.trim()}
      aria-label={`${occupied} van ${capacity.maxParticipants} plaatsen bezet`}
    >
      <div className={styles.capacityRing} style={style} aria-hidden="true" />
      <div className={styles.capacityNumbers}>
        <strong>{occupied} / {capacity.maxParticipants}</strong>
        <span>Plekken bezet</span>
      </div>
      <p>{capacity.availableCount} {capacity.availableCount === 1 ? "plek" : "plekken"} vrij</p>
      {capacity.waitlistCount ? (
        <p className={styles.waitlistCount}>{capacity.waitlistCount} op wachtlijst</p>
      ) : null}
    </div>
  );
}
