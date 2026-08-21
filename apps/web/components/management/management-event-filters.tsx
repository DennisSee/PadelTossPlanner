import Link from "next/link";

import type { SportFilter, StaffStatusFilter } from "../../lib/tos/event-filters";
import styles from "./tos-event-management.module.css";

export function ManagementEventFilters({
  status,
  sport,
  resultCount,
}: {
  status: StaffStatusFilter;
  sport: SportFilter;
  resultCount: number;
}) {
  return (
    <form className={styles.filters} method="get">
      <label>
        Status
        <select name="status" defaultValue={status}>
          <option value="current">Actueel</option>
          <option value="all">Alles</option>
          <option value="open">Open</option>
          <option value="closed">Gesloten</option>
          <option value="past">Afgelopen</option>
          <option value="draft">Concept</option>
          <option value="cancelled">Geannuleerd</option>
        </select>
      </label>
      <label>
        Sport
        <select name="sport" defaultValue={sport}>
          <option value="all">Alles</option>
          <option value="tennis">Tennis</option>
          <option value="padel">Padel</option>
        </select>
      </label>
      <button type="submit">Filteren</button>
      <Link href="/beheer">Wissen</Link>
      <span>{resultCount} {resultCount === 1 ? "event" : "events"}</span>
    </form>
  );
}
