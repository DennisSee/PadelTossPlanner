"use client";
import { useState } from "react";
import type { IdentityRound, LiveIdentity } from "../../lib/public-schedule/identity";
import styles from "./live-schedule.module.css";

export function PersonalLive({ identity, ownKey, now, slug }: { identity: LiveIdentity; ownKey: string; now: Date; slug: string }) {
  const [choice, setChoice] = useState(ownKey);
  // A stale publication or missing key never falls back to display-name matching.
  if (!identity.players.some((player) => player.key === ownKey)) return null;
  const selected = identity.players.some((player) => player.key === choice) ? choice : "";
  const current = identity.rounds.find((round) => Date.parse(round.starts_at) <= now.getTime() && now.getTime() < Date.parse(round.ends_at));
  const next = identity.rounds.find((round) => Date.parse(round.starts_at) > now.getTime());
  return <section className={styles.personalLive} aria-label="Persoonlijk live-schema">
    <a className={styles.mobileLiveLink} href={`/live/${slug}#persoonlijk`}>Mijn live-schema →</a>
    <div id="persoonlijk" className={styles.personalPicker}>
      <label htmlFor="live-person">Schema voor</label>
      <select id="live-person" value={selected} onChange={(event) => setChoice(event.target.value)}>
        <option value="">Iedereen · volledig schema</option>
        {identity.players.map((player, index) => <option key={player.key} value={player.key}>{player.name}{identity.players.filter((peer) => peer.name === player.name).length > 1 ? ` · speler ${index + 1}` : ""}{player.key === ownKey ? " · jij" : ""}</option>)}
      </select>
    </div>
    <p className={styles.hint} role="status">{current ? `Ronde ${current.number} is bezig.` : "Wachten op de volgende ronde."}</p>
    {selected ? <div className={styles.personalFocusGrid}>
      {current ? <PersonalFocus identity={identity} round={current} playerKey={selected} label="Nu" /> : <p>De volgende ronde begint binnenkort.</p>}
      {next ? <PersonalFocus identity={identity} round={next} playerKey={selected} label="Hierna" /> : null}
    </div> : null}
  </section>;
}

function PersonalFocus({ identity, round, playerKey, label }: { identity: LiveIdentity; round: IdentityRound; playerKey: string; label: string }) {
  const own = round.slots.find((slot) => slot.key === playerKey);
  if (!own) return null;
  const name = (key: string) => identity.players.find((player) => player.key === key)?.name ?? "";
  const peers = round.slots.filter((slot) => slot.key !== playerKey && slot.state === "playing" && slot.court === own.court);
  const clock = (value: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const status = own.state === "playing" ? own.court : own.state === "rest" ? "Rust" : own.state === "not_arrived" ? "Nog niet aanwezig" : "Niet meer beschikbaar";
  return <article className={styles.personalFocus} aria-label={`${label}: ${status}`}>
    <span className={styles.personalFocusLabel}>{label}</span>
    <h2>{status}</h2>
    <p className={styles.personalFocusTime}>{clock(round.starts_at)}–{clock(round.ends_at)}</p>
    {own.state === "playing" ? <dl>
      <div><dt>Samen met</dt><dd>{peers.filter((peer) => peer.team === own.team).map((peer) => name(peer.key)).join(" & ")}</dd></div>
      <div><dt>Tegen</dt><dd>{peers.filter((peer) => peer.team !== own.team).map((peer) => name(peer.key)).join(" & ")}</dd></div>
    </dl> : <p>Deze ronde speel je niet.</p>}
    <small>Ronde {round.number}</small>
  </article>;
}
