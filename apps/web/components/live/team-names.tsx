import styles from "./live-schedule.module.css";

const TEAM_SEPARATOR = " & ";

function isSelectedPlayer(name: string, selectedPlayer?: string): boolean {
  if (!selectedPlayer) {
    return false;
  }
  return name.trim().toLocaleLowerCase("nl-NL") ===
    selectedPlayer.trim().toLocaleLowerCase("nl-NL");
}

export function TeamNames({
  team,
  selectedPlayer,
}: {
  team: string;
  selectedPlayer?: string;
}) {
  const names = team.split(TEAM_SEPARATOR).map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) {
    return <span className={styles.teamNames}>—</span>;
  }

  return (
    <span className={styles.teamNames}>
      {names.map((name, index) => {
        const selected = isSelectedPlayer(name, selectedPlayer);
        return (
          <span className={styles.teamNamePart} key={`${name}-${index}`}>
            {index > 0 ? <span className={styles.teamSeparator}> &amp; </span> : null}
            <span
              className={selected ? styles.selectedPlayer : undefined}
              data-player-name={name}
              data-selected-player={selected ? "true" : undefined}
            >
              <span>{name}</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}
