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
  stacked = false,
  avatars = false,
  emphasizeFirst = false,
}: {
  team: string;
  selectedPlayer?: string;
  stacked?: boolean;
  avatars?: boolean;
  emphasizeFirst?: boolean;
}) {
  const names = team.split(TEAM_SEPARATOR).map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) {
    return <span className={styles.teamNames}>—</span>;
  }

  return (
    <span className={`${styles.teamNames} ${stacked ? styles.boardTeam : ""} ${avatars ? styles.avatarTeam : ""}`}>
      {names.map((name, index) => {
        const selected = isSelectedPlayer(name, selectedPlayer);
        return (
          <span className={styles.teamNamePart} key={`${name}-${index}`}>
            {index > 0 ? <span className={styles.teamSeparator}> &amp; </span> : null}
            {avatars ? <span className={styles.playerAvatar} aria-hidden="true">{name.trim().split(/\s+/u).filter(Boolean).map((part) => Array.from(part)[0]).filter(Boolean).filter((_, index, parts) => index === 0 || index === parts.length - 1).join("").slice(0, 2).toLocaleUpperCase("nl-NL")}</span> : null}
            <span
              className={selected || (emphasizeFirst && index === 0) ? styles.selectedPlayer : undefined}
              data-player-name={name}
              title={name}
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
