"use client";

import Link from "next/link";
import { useRef } from "react";

import type { ParticipantStatusFilter, SportFilter } from "../../lib/tos/event-filters";
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
      <label>
        Sport
        <select name="sport" value={sport} onChange={() => form.current?.requestSubmit()}>
          <option value="all">Alles</option>
          <option value="tennis">Tennis</option>
          <option value="padel">Padel</option>
        </select>
      </label>
      <span className={styles.resultCount}>{resultCount} {resultCount === 1 ? "TOS-avond" : "TOS-avonden"}</span>
      <Link href="/tos">Filters wissen</Link>
      <button className={styles.filterSubmit} type="submit">Filters toepassen</button>
    </form>
  );
}
