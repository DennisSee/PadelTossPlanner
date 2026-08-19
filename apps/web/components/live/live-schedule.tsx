"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
  Badge,
  AppHeader,
  Card,
  StateMessage,
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
  TimedRound,
} from "../../lib/public-schedule/types";

import styles from "./live-schedule.module.css";

const EVERYONE = "Iedereen";
const PLAYER_PREFERENCE_KEY = "tc-zuid-tos/preferred-player";
const PLAYER_PREFERENCE_EVENT = "tc-zuid-tos:preferred-player";

function usePlayerPreference(participants: string[]): [string, (value: string) => void] {
  const memoryPreference = useRef(EVERYONE);
  const storageAvailable = useRef(true);

  const subscribe = useCallback((notify: () => void) => {
    const notifyForPreference = (event: StorageEvent) => {
      if (event.key === null || event.key === PLAYER_PREFERENCE_KEY) {
        notify();
      }
    };
    window.addEventListener("storage", notifyForPreference);
    window.addEventListener(PLAYER_PREFERENCE_EVENT, notify);
    return () => {
      window.removeEventListener("storage", notifyForPreference);
      window.removeEventListener(PLAYER_PREFERENCE_EVENT, notify);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    let saved = memoryPreference.current;
    if (storageAvailable.current) {
      try {
        saved = window.localStorage.getItem(PLAYER_PREFERENCE_KEY) ?? EVERYONE;
        memoryPreference.current = saved;
      } catch {
        storageAvailable.current = false;
      }
    }
    return participants.find(
      (participant) => participant.toLocaleLowerCase("nl-NL") === saved.toLocaleLowerCase("nl-NL"),
    ) ?? EVERYONE;
  }, [participants]);

  const selected = useSyncExternalStore(subscribe, getSnapshot, () => EVERYONE);
  const update = useCallback((value: string) => {
    memoryPreference.current = value;
    if (storageAvailable.current) {
      try {
        window.localStorage.setItem(PLAYER_PREFERENCE_KEY, value);
      } catch {
        storageAvailable.current = false;
      }
    }
    window.dispatchEvent(new Event(PLAYER_PREFERENCE_EVENT));
  }, []);
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
    >
      <div className={styles.roundHeader}>
        <h3 className={styles.roundTitle}>Ronde {round.roundNumber}</h3>
        <div className={styles.roundHeader}>
          <RoundStateBadge state={state} />
          <span className={styles.roundTime}>{round.roundTime}</span>
        </div>
      </div>
      <div className={styles.matches}>
        {round.rows.map((row, index) => (
          <div className={styles.match} key={`${row.Baan}-${index}`}>
            <div className={`${styles.court} ${courtClass(row.Baan)}`.trim()}>{row.Baan || "Baan"}</div>
            <div className={styles.matchup}>
              <span>{row["Team 1"] || "—"}</span>
              <span className={styles.versus}>vs</span>
              <span>{row["Team 2"] || "—"}</span>
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
  state,
}: {
  round: PersonalRound;
  state?: "current" | "next";
}) {
  const copy = {
    rest: ["Rust", "Deze ronde heb je rust."],
    "not-arrived": ["Nog niet aanwezig", "Deze ronde ben je nog niet beschikbaar."],
    unavailable: ["Niet meer beschikbaar", "Deze ronde valt na jouw eindtijd."],
  } as const;

  return (
    <Card
      className={`${styles.roundCard} ${
        state === "current"
          ? styles.roundCurrent
          : state === "next"
            ? styles.roundNext
            : styles.roundNeutral
      }`.trim()}
    >
      <div className={styles.roundHeader}>
        <h3 className={styles.roundTitle}>Ronde {round.roundNumber}</h3>
        <div className={styles.roundHeader}>
          <RoundStateBadge state={state} />
          <span className={styles.roundTime}>{round.roundTime}</span>
        </div>
      </div>
      {round.status === "playing" ? (
        <div className={styles.match}>
          <div className={`${styles.court} ${courtClass(round.court)}`.trim()}>{round.court}</div>
          <div className={styles.matchup}>
            <span>{round.teamOne}</span>
            <span className={styles.versus}>vs</span>
            <span>{round.teamTwo}</span>
          </div>
        </div>
      ) : (
        <div className={styles.personalBody}>
          <p className={styles.personalStatus}>{copy[round.status][0]}</p>
          <p className={styles.personalText}>{copy[round.status][1]}</p>
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
      <div className={styles.grid}>
        {groupScheduleRows(schedule.rows).map((round) => (
          <RoundCard
            key={`${round.roundNumber}-${round.roundTime}`}
            round={round}
            state={stateForRound(round.roundNumber, state)}
          />
        ))}
      </div>
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
          state={stateForRound(round.roundNumber, state)}
        />
      ))}
    </div>
  );
}

function FocusRound({
  round,
  selectedPlayer,
  state,
}: {
  round: TimedRound;
  selectedPlayer: string;
  state: "current" | "next";
}) {
  if (selectedPlayer === EVERYONE) {
    return <RoundCard round={round} state={state} />;
  }
  const personal = personalScheduleRows(round.rows, selectedPlayer)[0];
  return personal ? <PersonalRoundCard round={personal} state={state} /> : null;
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
  if (state.kind === "untimed") {
    return (
      <>
        <p className={styles.warning} role="status">
          Live-status kon niet worden bepaald; de rondetijden hebben een onbekend formaat.
        </p>
        <FullSchedule schedule={schedule} selectedPlayer={selectedPlayer} state={state} />
      </>
    );
  }
  if (state.kind === "before") {
    return (
      <>
        <LiveBanner
          title="Het schema staat klaar"
          text="Alle rondes zijn alvast zichtbaar."
          countdown={`Start over ${state.startsInMinutes} min`}
        />
        <FullSchedule schedule={schedule} selectedPlayer={selectedPlayer} state={state} />
      </>
    );
  }
  if (state.kind === "after") {
    return (
      <>
        <LiveBanner
          title="De TOS-avond is afgelopen"
          text="Alle rondes blijven hieronder zichtbaar."
          countdown="Afgelopen"
        />
        <FullSchedule schedule={schedule} selectedPlayer={selectedPlayer} state={state} />
      </>
    );
  }

  const current = state.kind === "current" ? state.current : null;
  const next = state.next;
  return (
    <>
      {state.kind === "between" ? (
        <LiveBanner
          title="Volgende ronde komt eraan"
          text="Controleer alvast je baan en medespelers."
          countdown={`Start over ${state.startsInMinutes} min`}
        />
      ) : null}
      <div className={styles.liveGrid}>
        {current ? (
          <section
            aria-label="Huidige ronde"
            className={`${styles.livePanel} ${styles.currentPanel}`}
          >
            <div className={styles.panelHeading}>
              <span>Nu bezig</span>
              <span>Nog {state.kind === "current" ? state.remainingMinutes : 0} min</span>
            </div>
            <FocusRound round={current} selectedPlayer={selectedPlayer} state="current" />
          </section>
        ) : null}
        {next ? (
          <section
            aria-label="Volgende ronde"
            className={`${styles.livePanel} ${styles.nextPanel} ${
              state.nextIsUrgent ? styles.urgentPanel : ""
            }`.trim()}
          >
            <div className={styles.panelHeading}>
              <span>{state.nextIsUrgent ? "Klaarmaken" : "Volgende ronde"}</span>
              <span>{state.kind === "between" ? `Start over ${state.startsInMinutes} min` : "Hierna"}</span>
            </div>
            <FocusRound round={next} selectedPlayer={selectedPlayer} state="next" />
          </section>
        ) : null}
      </div>
      <Card className={styles.allRounds}>
        <details>
          <summary>{selectedPlayer === EVERYONE ? "Alle rondes bekijken" : "Mijn volledige schema"}</summary>
          <FullSchedule schedule={schedule} selectedPlayer={selectedPlayer} state={state} />
        </details>
      </Card>
    </>
  );
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

export function LiveSchedule({
  schedule,
  initialNowIso,
}: {
  schedule: PublicSchedule;
  initialNowIso: string;
}) {
  const participants = useMemo(() => sortedParticipants(schedule.participants), [schedule.participants]);
  const [selectedPlayer, setSelectedPlayer] = usePlayerPreference(participants);
  const [now, setNow] = useState(() => new Date(initialNowIso));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), LIVE_REFRESH_MILLISECONDS);
    return () => window.clearInterval(timer);
  }, []);

  const state = getLiveRoundState(schedule.rows, schedule.eventDate, now);
  const status = eventStatus(state);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <AppHeader subtitle="Live TOS-schema" />
          <Link className={styles.backLink} href="/">← Terug</Link>
        </div>

        <Card className={styles.eventCard}>
          <div className={styles.eventSummary}>
            <h1 className={styles.eventTitle}>{formatEventDate(schedule.eventDate)}</h1>
            <p className={styles.eventMeta}>
              <span>{schedule.startTime}–{schedule.endTime}</span>
              <span>{schedule.courts.length} {schedule.courts.length === 1 ? "baan" : "banen"}</span>
              <span>{participants.length} deelnemers</span>
            </p>
          </div>
          <div className={styles.eventStatus}><Badge tone={status.tone}>{status.label}</Badge></div>
        </Card>

        <Card className={styles.controlSurface}>
          <div className={styles.selectBlock}>
            <label className={styles.label} htmlFor="player-select">Kies je naam</label>
            <select
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
            <p className={styles.hint}>Alleen onthouden op dit apparaat.</p>
          </div>

          <div className={styles.participants}>
            <details>
              <summary>Deelnemers ({participants.length})</summary>
              <div className={styles.chips}>
                {participants.map((participant) => (
                  <span className={styles.chip} key={participant}>{participant}</span>
                ))}
              </div>
            </details>
          </div>
        </Card>

        <h2 className={styles.scheduleTitle}>
          {selectedPlayer === EVERYONE ? "Wedstrijdschema" : `Schema voor ${selectedPlayer}`}
        </h2>

        {schedule.rows.length > 0 ? (
          <LiveContent schedule={schedule} selectedPlayer={selectedPlayer} state={state} />
        ) : (
          <StateMessage title="Nog geen wedstrijden">
            Het gepubliceerde schema bevat nog geen ronde-indeling.
          </StateMessage>
        )}

        <footer className={styles.footer}>
          Gepubliceerd door {schedule.createdByName || "T.C. Zuid"} · {formatCreatedAt(schedule.createdAt)}
        </footer>
      </div>
    </main>
  );
}
