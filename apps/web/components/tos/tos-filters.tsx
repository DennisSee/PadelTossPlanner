"use client";

import Link from "next/link";
import { useRef } from "react";

import type { ParticipantStatusFilter, SportFilter } from "../../lib/tos/event-filters";
import { SportIcon } from "../ui";
import styles from "./tos.module.css";

export function TosFilters({
  status,
  sport,
  resultCount,
}: {
  status: ParticipantStatusFilter;
  sport: SportFilter;
  resultCount: number;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form className={styles.filters} method="get" ref={form}>
      <strong>Filter TOS-avonden</strong>
      <label>
        Status
        <select name="status" value={status} onChange={() => form.current?.requestSubmit()}>
          <option value="all">Alles</option>
          <option value="open">Open</option>
          <option value="closed">Gesloten</option>
        </select>
      </label>
      <fieldset className={styles.sportFilter}>
        <legend>Sport</legend>
        <div className={styles.sportSegments}>
          <label className={sport === "all" ? styles.sportSegmentActive : ""}>
            <input name="sport" type="radio" value="all" checked={sport === "all"} onChange={() => form.current?.requestSubmit()} />
            <span>Alles</span>
          </label>
          <label className={sport === "padel" ? styles.sportSegmentActive : ""}>
            <input name="sport" type="radio" value="padel" checked={sport === "padel"} onChange={() => form.current?.requestSubmit()} />
            <SportIcon sport="padel" />
            <span>Padel</span>
          </label>
          <label className={`${styles.sportSegmentTennis} ${sport === "tennis" ? styles.sportSegmentActive : ""}`.trim()}>
            <input name="sport" type="radio" value="tennis" checked={sport === "tennis"} onChange={() => form.current?.requestSubmit()} />
            <SportIcon sport="tennis" />
            <span>Tennis</span>
          </label>
        </div>
      </fieldset>
      <span className={styles.resultCount}>{resultCount} {resultCount === 1 ? "TOS-avond" : "TOS-avonden"}</span>
      <Link href="/tos">Filters wissen</Link>
      <button className={styles.filterSubmit} type="submit">Filters toepassen</button>
    </form>
  );
}
