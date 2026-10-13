"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
  Badge,
  ANONYMOUS_NAVIGATION,
  AppHeader,
  Card,
  CourtLines,
  SiteNavigation,
  StateMessage,
  type NavigationModel,
} from "../ui";
import {
  formatCreatedAt,
  formatEventDate,
  getLiveRoundState,
  groupScheduleRows,
  LIVE_REFRESH_MILLISECONDS,
  personalScheduleRows,
  sortedParticipants,
  splitStatusNames,
} from "../../lib/public-schedule/rounds";
import type {
  GroupedRound,
  LiveRoundState,
  PersonalRound,
  PublicSchedule,
} from "../../lib/public-schedule/types";

import styles from "./live-schedule.module.css";
import { TeamNames } from "./team-names";
import { PersonalSchedule } from "./personal-schedule";
import { PersonalLive } from "./personal-live";

const EVERYONE = "Iedereen";
const PLAYER_PREFERENCE_EVENT = "tc-zuid-tos:preferred-player";

function usePlayerPreference(participants: string[], eventSlug = "latest"): [string, (value: string) => void] {
  const preferenceKey = `tc-zuid-tos/preferred-player:${eventSlug}`;
  const memoryPreference = useRef(EVERYONE);
  const storageAvailable = useRef(true);

  const subscribe = useCallback((notify: () => void) => {
    const notifyForPreference = (event: StorageEvent) => {
      if (event.key === null || event.key === preferenceKey) {
        notify();
      }
    };
    window.addEventListener("storage", notifyForPreference);
    window.addEventListener(PLAYER_PREFERENCE_EVENT, notify);
    return () => {
      window.removeEventListener("storage", notifyForPreference);
      window.removeEventListener(PLAYER_PREFERENCE_EVENT, notify);
    };
  }, [preferenceKey]);

  const getSnapshot = useCallback(() => {
    let saved = memoryPreference.current;
    if (storageAvailable.current) {
      try {
        saved = window.localStorage.getItem(preferenceKey) ?? EVERYONE;
        memoryPreference.current = saved;
      } catch {
        storageAvailable.current = false;
      }
    }
    return participants.find(
      (participant) => participant.toLocaleLowerCase("nl-NL") === saved.toLocaleLowerCase("nl-NL"),
    ) ?? EVERYONE;
  }, [participants, preferenceKey]);

  const selected = useSyncExternalStore(subscribe, getSnapshot, () => EVERYONE);
  const update = useCallback((value: string) => {
    memoryPreference.current = value;
    if (storageAvailable.current) {
      try {
        window.localStorage.setItem(preferenceKey, value);
      } catch {
        storageAvailable.current = false;
      }
    }
    window.dispatchEvent(new Event(PLAYER_PREFERENCE_EVENT));
  }, [preferenceKey]);
  return [selected, update];
}

function courtClass(court: string): string {
  return {
    "Kremer Baan": styles.courtKremer,
    "ZGA/F&F Baan": styles.courtZga,
    "PlaySeat Baan": styles.courtPlayseat,
    "Seppworks/Bax Baan": styles.courtSeppworks,
  }[court] ?? "";
}

function RoundStateBadge({ state }: { state?: "current" | "next" }) {
  if (state === "current") {
    return <Badge tone="success">Nu</Badge>;
  }
  if (state === "next") {
    return <Badge tone="warning">Hierna</Badge>;
  }
  return null;
}

function CourtBadge({ court, prominent = false }: { court: string; prominent?: boolean }) {
  const label = court || "Baan";
  return (
    <span
      className={`${styles.court} ${prominent ? styles.focusCourtBadge : ""} ${courtClass(court)}`.trim()}
      data-testid="court-badge"
      title={label}
    >
      {prominent ? <span className={styles.courtCaption}>BAAN</span> : <span className={styles.courtDot} aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
}

function StatusChips({ round }: { round: GroupedRound }) {
  const first = round.rows[0];
  const groups = [
    { label: "Rust", names: splitStatusNames(first.Rust), rest: true },
    {
      label: "Nog niet aanwezig",
      names: splitStatusNames(first["Nog niet aanwezig"]),
      rest: false,
    },
    {
      label: "Niet meer beschikbaar",
      names: splitStatusNames(first["Niet meer beschikbaar"]),
      rest: false,
    },
  ];
  const visible = groups.filter((group) => group.names.length > 0);
  if (visible.length === 0) {
    return null;
  }
  return (
    <div className={styles.roundFooter}>
      {visible.map((group) => (
        <span
          className={`${styles.footerChip} ${group.rest ? styles.restChip : ""}`.trim()}
          key={group.label}
        >
          <strong>{group.label}</strong>
          <span aria-hidden="true">: </span>
          {group.names.join(", ")}
        </span>
      ))}
    </div>
  );
}

function RoundCard({
  round,
  state,
}: {
  round: GroupedRound;
  state?: "current" | "next";
}) {
  return (
    <Card
      className={`${styles.roundCard} ${
        state === "current"
          ? styles.roundCurrent
          : state === "next"
            ? styles.roundNext
            : styles.roundNeutral
      }`.trim()}
      data-round-number={round.roundNumber}
    >
      <div className={styles.roundHeader}>
        <h3 className={styles.roundTitle}>Ronde {round.roundNumber}</h3>
        <div className={styles.roundMeta}>
          <RoundStateBadge state={state} />
          <span className={styles.roundTime}>{round.roundTime}</span>
        </div>
      </div>
      <div className={styles.matches}>
        {round.rows.map((row, index) => (
          <div className={`${styles.match} ${styles.boardMatch}`} key={`${row.Baan}-${index}`}>
            <div className={styles.matchHeader}><CourtBadge court={row.Baan} /><span className={styles.matchTime}>{round.roundTime}</span></div>
            <div className={`${styles.matchup} ${styles.boardMatchup}`}>
              <div className={styles.boardTeamColumn} role="group" aria-label="Eerste team"><TeamNames team={row["Team 1"]} stacked avatars /></div>
              <span className={styles.versus}>VS</span>
              <div className={styles.boardTeamColumn} role="group" aria-label="Tweede team"><TeamNames team={row["Team 2"]} stacked avatars /></div>
            </div>
          </div>
        ))}
      </div>
      <StatusChips round={round} />
    </Card>
  );
}

function PersonalRoundCard({
  round,
  selectedPlayer,
  state,
  focus = false,
}: {
  round: PersonalRound;
  focus?: boolean;
  selectedPlayer: string;
  state?: "current" | "next";
}) {
  const copy = {
    rest: ["Rust", "Deze ronde speel je niet.", styles.personalStatusRest],
    "not-arrived": ["Nog niet aanwezig", "Je bent deze ronde nog niet beschikbaar.", styles.personalStatusMuted],
    unavailable: ["Niet meer beschikbaar", "Deze ronde valt na jouw eindtijd.", styles.personalStatusMuted],
  } as const;
  const teamOne = round.teamOne.split(" & ");
  const teamTwo = round.teamTwo.split(" & ");
  const isSelected = (name: string) => name.toLocaleLowerCase("nl-NL") === selectedPlayer.toLocaleLowerCase("nl-NL");
  const ownTeam = teamOne.some(isSelected) ? teamOne : teamTwo;
  const opponents = teamOne.some(isSelected) ? round.teamTwo : round.teamOne;

  return (
    <Card
      className={`${styles.roundCard} ${
        state === "current"
          ? styles.roundCurrent
          : state === "next"
            ? styles.roundNext
            : styles.roundNeutral
      } ${round.status === "playing" ? "" : styles.personalStateCard}`.trim()}
      data-round-number={round.roundNumber}
    >
      <div className={styles.roundHeader}>
        <h3 className={styles.roundTitle}>Ronde {round.roundNumber}</h3>
        <div className={styles.roundMeta}>
          <RoundStateBadge state={state} />
          <span className={styles.roundTime}>{round.roundTime}</span>
        </div>
      </div>
      {focus ? <p className={styles.personalFocusLabel}>{state === "current" ? round.status === "playing" ? "Nu spelen" : round.status === "rest" ? "Nu rust" : "Nu" : "Hierna"}</p> : null}
      {round.status === "playing" ? (
        <div className={`${styles.match} ${styles.personalMatch} ${focus ? styles.focusMatch : ""}`}>
          <CourtBadge court={round.court} prominent={focus} />
          {focus ? <div>
            <p className={styles.manualSelected}>{selectedPlayer}</p>
            <dl className={styles.focusTeams}>
              <div><dt>Samen met</dt><dd><TeamNames team={ownTeam.filter((name) => !isSelected(name)).join(" & ")} /></dd></div>
              <div><dt>Tegen</dt><dd><TeamNames team={opponents} /></dd></div>
            </dl>
          </div> : <div className={styles.matchup}>
            <TeamNames team={round.teamOne} selectedPlayer={selectedPlayer} />
            <span className={styles.versus}>vs</span>
            <TeamNames team={round.teamTwo} selectedPlayer={selectedPlayer} />
          </div>}
        </div>
      ) : (
        <div className={styles.personalBody} data-personal-status={round.status}>
          <span className={`${styles.personalStatus} ${copy[round.status][2] ?? styles.personalStatusMuted}`.trim()}>
            {copy[round.status][0]}
          </span>
          <span className={styles.personalText}>{copy[round.status][1]}</span>
        </div>
      )}
    </Card>
  );
}

function LiveBanner({ title, text, countdown }: { title: string; text: string; countdown: string }) {
  return (
    <div className={styles.liveBanner} role="status">
      <div>
        <p className={styles.bannerTitle}>{title}</p>
        <p className={styles.bannerText}>{text}</p>
      </div>
      <span className={styles.countdown}>{countdown}</span>
    </div>
  );
}

function stateForRound(
  roundNumber: string,
  state: LiveRoundState,
): "current" | "next" | undefined {
  if (state.kind === "current" && state.current.roundNumber === roundNumber) {
    return "current";
  }
  const next = state.kind === "current" || state.kind === "between" || state.kind === "before"
    ? state.next
    : null;
  if (next?.roundNumber === roundNumber) {
    return "next";
  }
  return undefined;
}

function FullSchedule({
  schedule,
  selectedPlayer,
  state,
}: {
  schedule: PublicSchedule;
  selectedPlayer: string;
  state: LiveRoundState;
}) {
  if (selectedPlayer === EVERYONE) {
    return (
      <GeneralRoundBoard schedule={schedule} state={state} />
    );
  }

  const personal = personalScheduleRows(schedule.rows, selectedPlayer);
  if (personal.length === 0) {
    return (
      <StateMessage title="Geen rondes gevonden">
        Voor deze speler staat geen indeling in het gepubliceerde schema.
      </StateMessage>
    );
  }
  return (
    <div className={styles.grid}>
      {personal.map((round) => (
        <PersonalRoundCard
          key={`${round.roundNumber}-${round.roundTime}`}
          round={round}
          selectedPlayer={selectedPlayer}
          state={stateForRound(round.roundNumber, state)}
        />
      ))}
    </div>
  );
}

function GeneralRoundBoard({ schedule, state }: { schedule: PublicSchedule; state: LiveRoundState }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const rounds = groupScheduleRows(schedule.rows);
  const current = state.kind === "current" ? state.current : null;
  const next = state.kind === "current" || state.kind === "between" || state.kind === "before" ? state.next : null;
  const selected = chosen === "all" ? "all" : rounds.find((round) => round.roundNumber === chosen)?.roundNumber
    ?? current?.roundNumber ?? rounds[0]?.roundNumber;
  const visible = selected === "all" ? rounds : rounds.filter((round) => round.roundNumber === selected);
  return <div className={styles.matchdayBoard}>
    <nav className={styles.roundNavigation} aria-label="Ronde kiezen">
      {rounds.map((round) => <button key={round.roundNumber} type="button" aria-pressed={selected === round.roundNumber}
        aria-label={`Bekijk ronde ${round.roundNumber}`} onClick={() => setChosen(round.roundNumber)}>
        Ronde {round.roundNumber}{current?.roundNumber === round.roundNumber ? <small>Nu</small> : next?.roundNumber === round.roundNumber ? <small>Hierna</small> : null}
      </button>)}
      <button type="button" aria-pressed={selected === "all"} onClick={() => setChosen("all")}>Alle rondes</button>
    </nav>
    {current ? <div className="sr-only" role="status">Nu bezig · {current.roundTime}<span>Nog {state.kind === "current" ? state.remainingMinutes : 0} min</span></div> : null}
    {state.kind === "before" || state.kind === "between" ? <LiveBanner title={state.kind === "before" ? "Het schema staat klaar" : "Volgende ronde komt eraan"}
      text="Alle rondes zijn beschikbaar via de rondekiezer." countdown={`Start over ${state.startsInMinutes} min`} /> : null}
    {state.kind === "after" ? <p className={styles.hint}>Afgelopen · alle rondes blijven bekijkbaar.</p> : null}
    {state.kind === "untimed" ? <p className={styles.warning} role="status">Live-status kon niet worden bepaald; de rondetijden hebben een onbekend formaat.</p> : null}
    <div className={styles.selectedRounds}>
      {visible.map((round) => <section key={round.roundNumber} aria-label={current?.roundNumber === round.roundNumber ? "Huidige ronde" : next?.roundNumber === round.roundNumber ? "Volgende ronde" : `Wedstrijden ronde ${round.roundNumber}`}>
        <RoundCard round={round} state={stateForRound(round.roundNumber, state)} />
      </section>)}
    </div>
  </div>;
}

function LiveContent({
  schedule,
  selectedPlayer,
  state,
}: {
  schedule: PublicSchedule;
  selectedPlayer: string;
  state: LiveRoundState;
}) {
  if (selectedPlayer !== EVERYONE) {
    const next = state.kind === "current" || state.kind === "between" ? state.next : null;
    return <PersonalSchedule key={`${schedule.id}-${selectedPlayer}`} active={state.kind === "current" || state.kind === "between"}
      currentId={state.kind === "current" ? state.current.roundNumber : undefined} nextId={next?.roundNumber} playerName={selectedPlayer}
      rounds={personalScheduleRows(schedule.rows, selectedPlayer).map((round) => {
        const teamOne = round.teamOne.split(" & ");
        const teamTwo = round.teamTwo.split(" & ");
        const matches = (name: string) => name.toLocaleLowerCase("nl-NL") === selectedPlayer.toLocaleLowerCase("nl-NL");
        const ownTeam = teamOne.some(matches) ? teamOne : teamTwo;
        const selectedIndex = ownTeam.findIndex(matches);
        return { id: round.roundNumber, number: round.roundNumber, time: round.roundTime, status: round.status, court: round.court,
          partner: ownTeam.filter((_, index) => index !== selectedIndex).join(" & "), opponents: teamOne.some(matches) ? round.teamTwo : round.teamOne };
      })} />;
  }
  return <GeneralRoundBoard schedule={schedule} state={state} />;
}

function eventStatus(state: LiveRoundState): { label: string; tone: "neutral" | "success" | "warning" } {
  if (state.kind === "current" || state.kind === "between") {
    return { label: "Live", tone: "success" };
  }
  if (state.kind === "before") {
    return { label: "Schema staat klaar", tone: "warning" };
  }
  if (state.kind === "after") {
    return { label: "Afgelopen", tone: "neutral" };
  }
  return { label: "Schema", tone: "neutral" };
}

function MetadataIcon({ kind }: { kind: "date" | "time" | "courts" | "players" }) {
  return <svg className={styles.metadataIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "date" ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2" /></> : null}
    {kind === "time" ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> : null}
    {kind === "courts" ? <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M8 3v18m8-18v18M4 12h16" /></> : null}
    {kind === "players" ? <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6m2 11v-3a6 6 0 0 0-2-4" /></> : null}
  </svg>;
}

export function LiveSchedule({
  schedule,
  initialNowIso,
  navigation = ANONYMOUS_NAVIGATION,
  ownPlayerKey = null,
}: {
  schedule: PublicSchedule;
  initialNowIso: string;
  navigation?: NavigationModel;
  ownPlayerKey?: string | null;
}) {
  const participants = useMemo(() => sortedParticipants(schedule.participants), [schedule.participants]);
  const participantCount = schedule.liveIdentity?.players.length ?? participants.length;
  const [selectedPlayer, setSelectedPlayer] = usePlayerPreference(participants, schedule.eventSlug);
  const [now, setNow] = useState(() => new Date(initialNowIso));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), LIVE_REFRESH_MILLISECONDS);
    return () => window.clearInterval(timer);
  }, []);

  const state = getLiveRoundState(schedule.rows, schedule.eventDate, now);
  const status = eventStatus(state);
  const currentEvent = schedule.eventStartsAt && schedule.eventEndsAt
    ? Date.parse(schedule.eventStartsAt) <= now.getTime() && now.getTime() < Date.parse(schedule.eventEndsAt)
    : state.kind === "current" || state.kind === "between";
  const personal = currentEvent && ownPlayerKey && schedule.liveIdentity && schedule.liveIdentity.players.some((player) => player.key === ownPlayerKey);
  const eventTitle = schedule.eventTitle ?? (currentEvent ? "Live TOS-schema" : "TOS-schema");

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <AppHeader subtitle="Live TOS-schema" />
          <SiteNavigation model={navigation} currentPath="/live" />
        </div>

        <Card className={styles.eventCard}>
          <CourtLines className={styles.eventLines} />
          <div className={styles.eventSummary} data-testid="event-summary">
            <h1 className={styles.eventTitle} title={eventTitle}>{personal || selectedPlayer !== EVERYONE ? "Jouw schema" : eventTitle}</h1>
            <p className={styles.eventDate}><MetadataIcon kind="date" />{formatEventDate(schedule.eventDate)}</p>
            <p className={styles.eventMeta}>
              <span><MetadataIcon kind="time" />{schedule.startTime}–{schedule.endTime}</span>
              <span><MetadataIcon kind="courts" />{schedule.courts.length} {schedule.courts.length === 1 ? "baan" : "banen"}</span>
              <span><MetadataIcon kind="players" />{participantCount} deelnemers</span>
            </p>
          </div>
          <div className={styles.eventStatus} data-testid="event-status">
            <Badge tone={currentEvent ? status.tone : "neutral"}>{!currentEvent && status.label === "Live" ? "Schema" : status.label}</Badge>
          </div>
        </Card>

        {personal ? <PersonalLive key={`${schedule.id}-${ownPlayerKey}`} identity={schedule.liveIdentity!} ownKey={ownPlayerKey!} now={now} slug={schedule.eventSlug!} everyoneSchedule={<FullSchedule schedule={schedule} selectedPlayer={EVERYONE} state={state} />} /> : null}
        {!personal ? <Card className={styles.controlSurface}>
          <div className={styles.selectBlock}>
            <label className={styles.label} htmlFor="player-select">Bekijk schema voor:</label>
            <select
              aria-label="Kies je naam"
              className={styles.select}
              id="player-select"
              value={selectedPlayer}
              onChange={(event) => setSelectedPlayer(event.target.value)}
            >
              <option value={EVERYONE}>{EVERYONE}</option>
              {participants.map((participant) => (
                <option key={participant} value={participant}>{participant}</option>
              ))}
            </select>
          </div>
        </Card> : null}

        {!personal ? <h2 className="sr-only">
          {personal || selectedPlayer === EVERYONE ? "Wedstrijdschema" : `Schema voor ${selectedPlayer}`}
        </h2> : null}

        {!personal && schedule.rows.length > 0 ? (
          <LiveContent schedule={schedule} selectedPlayer={selectedPlayer} state={state} />
        ) : !personal ? (
          <StateMessage title="Nog geen wedstrijden">
            Het gepubliceerde schema bevat nog geen ronde-indeling.
          </StateMessage>
        ) : null}

        <footer className={styles.footer}>
          <details className={styles.secondaryParticipants}>
            <summary>Deelnemers ({participantCount})</summary>
            <div className={styles.chips}>{participants.map((participant) => <span className={styles.chip} key={participant}>{participant}</span>)}</div>
          </details>
          {!currentEvent ? <p className={styles.noCurrent} role="status">Er is nu geen TOS bezig.{state.kind === "before" && schedule.eventSlug ? <> <a href={`/tos/${schedule.eventSlug}`}>Bekijk TOS →</a></> : null}</p> : null}
          <button className={styles.refreshButton} type="button" onClick={() => window.location.reload()}>Schema verversen</button>
          <p>De rondeklok loopt automatisch door. Ververs voor wijzigingen in de publicatie.</p>
          Gepubliceerd door {schedule.createdByName || "T.C. Zuid"} · {formatCreatedAt(schedule.createdAt)}
        </footer>
      </div>
    </main>
  );
}
