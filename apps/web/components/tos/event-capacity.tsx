import type { CSSProperties } from "react";

import type { EventCapacity } from "../../lib/tos/types";
import type { Sport } from "../ui";
import styles from "./tos.module.css";

export function EventCapacityPanel({ capacity, sport }: { capacity: EventCapacity; sport: Sport }) {
  const occupied = capacity.placedCount;
  const percentage = Math.min(100, Math.round((occupied / capacity.maxParticipants) * 100));
  const style = { "--occupancy": `${percentage}%` } as CSSProperties;
  return (
    <div
      className={`${styles.capacityPanel} ${sport === "padel" ? styles.capacityPadel : styles.capacityTennis} ${capacity.availableCount === 0 ? styles.capacityFull : ""}`.trim()}
      data-sport={sport}
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
