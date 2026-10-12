"use client";
import { useState, type ReactNode } from "react";
import type { LiveIdentity } from "../../lib/public-schedule/identity";
import { PersonalSchedule, type PersonalScheduleRound } from "./personal-schedule";
import styles from "./live-schedule.module.css";

export function PersonalLive({ identity, ownKey, now, slug, everyoneSchedule }: { identity: LiveIdentity; ownKey: string; now: Date; slug: string; everyoneSchedule?: ReactNode }) {
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
    <p className={styles.identityName}>{identity.players.find((player) => player.key === selected)?.name}</p>
    <p className={styles.hint} role="status">{current ? `Ronde ${current.number} is bezig.` : "Wachten op de volgende ronde."}</p>
    {selected ? <PersonalSchedule key={selected} rounds={identity.rounds.flatMap<PersonalScheduleRound>((round) => {
      const slot = round.slots.find((slot) => slot.key === selected);
      if (!slot) return [];
      const name = (key: string) => identity.players.find((player) => player.key === key)?.name ?? "";
      const peers = round.slots.filter((peer) => peer.key !== selected && peer.state === "playing" && peer.court === slot.court);
      const clock = (value: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
      return [{ id: String(round.number), number: String(round.number), time: clock(round.starts_at) + "–" + clock(round.ends_at),
        status: slot.state === "not_arrived" ? "not-arrived" : slot.state, court: slot.court ?? "",
        partner: peers.filter((peer) => peer.team === slot.team).map((peer) => name(peer.key)).join(" & "),
        opponents: peers.filter((peer) => peer.team !== slot.team).map((peer) => name(peer.key)).join(" & "),
      }];
    })} currentId={current ? String(current.number) : undefined} nextId={next ? String(next.number) : undefined}
      active={Boolean(current) || Boolean(next && Date.parse(identity.rounds[0]?.starts_at) <= now.getTime())}
      playerName={identity.players.find((player) => player.key === selected)?.name ?? ""} /> : <>
      <h2 className={styles.scheduleTitle}>Volledig schema</h2>{everyoneSchedule}
    </>}
  </section>;
}
