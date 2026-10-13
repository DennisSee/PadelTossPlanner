"use client";

import { useState } from "react";
import styles from "./live-schedule.module.css";
import { TeamNames } from "./team-names";

export type PersonalScheduleRound = {
  id: string;
  number: string;
  time: string;
  status: "playing" | "rest" | "not-arrived" | "unavailable";
  court: string;
  partner: string;
  opponents: string;
};

const statusCopy = {
  playing: "Spelen", rest: "Rust", "not-arrived": "Nog niet aanwezig", unavailable: "Niet meer beschikbaar",
};
const explanation = {
  rest: "Deze ronde speel je niet.", "not-arrived": "Je bent deze ronde nog niet beschikbaar.", unavailable: "Deze ronde valt na jouw eindtijd.",
};

export function PersonalSchedule({ rounds, currentId, nextId, active, playerName }: {
  rounds: readonly PersonalScheduleRound[];
  currentId?: string;
  nextId?: string;
  active: boolean;
  playerName: string;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const defaultRound = (active ? rounds.find((round) => round.id === currentId) ?? rounds.find((round) => round.id === nextId) : null)
    ?? rounds.find((round) => round.status === "playing") ?? rounds[0];
  const selected = rounds.find((round) => round.id === chosen) ?? defaultRound;
  if (!selected) return <p>Voor deze speler staat geen indeling in het gepubliceerde schema.</p>;
  const current = active && selected.id === currentId;
  const label = current ? "Nu" : active && selected.id === nextId ? "Hierna" : "Geselecteerde ronde";
  const next = active ? rounds.find((round) => round.id === nextId) : null;
  const select = (id: string) => setChosen(id);
  const compact = (round: PersonalScheduleRound) => <>
    <span><strong>Ronde {round.number}</strong><span className={styles.compactRoundTime}>{round.time}</span></span>
    <strong className={styles.compactRoundCourt} title={round.status === "playing" ? round.court : statusCopy[round.status]}>{round.status === "playing" ? round.court : statusCopy[round.status]}</strong>
    {round.status !== "rest" ? <span className={styles.compactRoundPartner} title={round.status === "playing" ? `Samen met ${round.partner}` : undefined} data-personal-status={round.status !== "playing" ? round.status : undefined}>{round.status === "playing" ? `Samen met ${round.partner}` : explanation[round.status]}</span> : null}
  </>;
  return <>
    <nav className={styles.roundNavigation} aria-label="Persoonlijke ronde kiezen">
      {rounds.map((round) => <button type="button" key={round.id} aria-pressed={round.id === selected.id} onClick={() => select(round.id)} aria-label={`Selecteer ronde ${round.number}`}>
        Ronde {round.number}
      </button>)}
    </nav>
    <section aria-label={current ? "Huidige ronde" : "Geselecteerde ronde"} data-personal-detail>
      <article className={`${styles.personalFocus} ${styles.personalScheduleDetail} ${current ? styles.personalFocusCurrent : ""}`} aria-label={`${label}: ${selected.status === "playing" ? selected.court : statusCopy[selected.status]}`}>
        <div className={styles.focusHeading}>
          <span className={styles.personalFocusLabel}>{current ? selected.status === "playing" ? "Nu spelen" : selected.status === "rest" ? "Nu rust" : "Nu" : label}</span>
          <h3 className={styles.focusRound}>Ronde {selected.number}</h3>
        </div>
        {selected.status === "playing" ? <div className={styles.focusCourt} data-testid="court-badge"><span>BAAN</span><h2 title={selected.court}>{selected.court}</h2></div> : current && selected.status === "rest" ? null : <h2>{statusCopy[selected.status]}</h2>}
        <p className={styles.personalFocusTime}>{selected.time}</p>
        <p className="sr-only" data-selected-player={selected.status === "playing" ? "true" : undefined} data-player-name={playerName}>{playerName}</p>
        {selected.status === "playing" ? <>{!current ? <p className={styles.roundStatus}>Spelen</p> : null}<dl className={styles.focusTeams}>
          <div><dt className="sr-only">Samen met</dt><dd><TeamNames team={[playerName, selected.partner].filter(Boolean).join(" & ")} stacked avatars emphasizeFirst /></dd></div>
          <div className={styles.personalVersus}><dt className="sr-only">Versus</dt><dd aria-hidden="true">VS</dd></div>
          <div><dt className="sr-only">Tegen</dt><dd><TeamNames team={selected.opponents} stacked avatars /></dd></div>
        </dl></> : <div data-personal-status={selected.status}>{explanation[selected.status]}</div>}
        {active && chosen && selected.id !== currentId && currentId ? <button className={styles.refreshButton} onClick={() => setChosen(null)}>Terug naar huidige ronde</button> : null}
      </article>
    </section>
    {next && next.id !== selected.id ? <section aria-label="Volgende ronde">
      <article aria-label={`Hierna: ${next.status === "playing" ? next.court : statusCopy[next.status]}`} className={styles.compactNext}>
        <p className={styles.personalFocusLabel}>Hierna</p>
        <button type="button" className={styles.compactRound} onClick={() => select(next.id)} aria-label={`Bekijk volgende ronde ${next.number}`}>{compact(next)}</button>
      </article>
    </section> : null}
    <h2 className={styles.scheduleTitle}>Volledig schema</h2>
    <div className={styles.compactRounds} aria-label="Persoonlijke rondes">
      {rounds.map((round) => <button type="button" key={round.id} className={styles.compactRound} aria-pressed={round.id === selected.id}
        onClick={() => select(round.id)} aria-label={`Bekijk ronde ${round.number}`}>
        {compact(round)}
      </button>)}
    </div>
  </>;
}
