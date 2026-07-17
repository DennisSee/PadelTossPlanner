"""Kleine rooktest die zonder pytest kan worden uitgevoerd."""

from datetime import time

from excel_export import build_excel_bytes
from planner import Player, PlannerSettings, generate_schedule


def main() -> None:
    players = [
        Player("Dennis", 4),
        Player("Marieke", 3),
        Player("Peter", 5),
        Player("Anita", 2),
        Player("Bjorn", 3),
        Player("Jeroen", 4),
        Player("Jim", 2),
        Player("Frans", 3),
        Player("Trever", 5),
        Player("Niels", 3),
    ]
    courts = ["Kremer Baan", "ZGA/F&F Baan"]
    settings = PlannerSettings(
        start_time=time(20, 0),
        end_time=time(22, 0),
        match_minutes=20,
        search_restarts=2,
        beam_width=8,
        candidates_per_state=45,
    )

    rounds, diagnostics = generate_schedule(players, courts, settings)
    assert len(rounds) == 6

    previous_rest: set[str] = set()
    partnerships: set[tuple[str, str]] = set()
    for round_plan in rounds:
        assert not previous_rest.intersection(round_plan.rest)
        previous_rest = set(round_plan.rest)
        active_players: list[str] = []
        for match in round_plan.matches:
            active_players.extend((*match.team1, *match.team2))
            for team in (match.team1, match.team2):
                key = tuple(sorted(team))
                assert key not in partnerships
                partnerships.add(key)
        assert len(active_players) == len(set(active_players)) == len(courts) * 4

    excel_bytes = build_excel_bytes(settings, players, courts, rounds, diagnostics)
    assert excel_bytes.startswith(b"PK")
    print("Rooktest geslaagd.")


if __name__ == "__main__":
    main()
