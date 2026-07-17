"""Rooktests voor de planner, inclusief spelers die later arriveren."""

from datetime import time

from excel_export import build_excel_bytes
from planner import Player, PlannerSettings, generate_schedule, schedule_rows


def _assert_basic_rules(rounds, courts) -> None:
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
        assert not set(active_players).intersection(round_plan.rest)
        assert not set(active_players).intersection(round_plan.unavailable)


def test_standard_schedule() -> None:
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
        search_restarts=3,
        beam_width=10,
        candidates_per_state=55,
    )
    rounds, diagnostics = generate_schedule(players, courts, settings)
    assert len(rounds) == 6
    assert all(not round_plan.unavailable for round_plan in rounds)
    _assert_basic_rules(rounds, courts)
    assert build_excel_bytes(settings, players, courts, rounds, diagnostics).startswith(b"PK")


def test_late_arrivals() -> None:
    players = [
        Player("Dennis", 4),
        Player("Marieke", 3),
        Player("Peter", 5),
        Player("Anita", 2),
        Player("Bjorn", 3),
        Player("Jeroen", 4),
        Player("Jim", 2),
        Player("Frans", 3),
        Player("Trever", 5, available_from=time(21, 0)),
        Player("Niels", 3, available_from=time(21, 0)),
    ]
    courts = ["Kremer Baan", "ZGA/F&F Baan"]
    settings = PlannerSettings(
        start_time=time(20, 0),
        end_time=time(22, 0),
        match_minutes=20,
        search_restarts=5,
        beam_width=14,
        candidates_per_state=75,
    )
    rounds, diagnostics = generate_schedule(players, courts, settings)
    assert len(rounds) == 6
    _assert_basic_rules(rounds, courts)

    late = {"Trever", "Niels"}
    for round_plan in rounds[:3]:
        assert set(round_plan.unavailable) == late
        assert round_plan.rest == tuple()
    for round_plan in rounds[3:]:
        assert not round_plan.unavailable
        assert len(round_plan.rest) == 2

    rows = schedule_rows(rounds, courts, players, settings)
    assert rows[0]["Nog niet aanwezig"] in {"Niels, Trever", "Trever, Niels"}
    assert diagnostics["unavailable_counts"]["Trever"] == 3
    assert diagnostics["rest_counts"]["Trever"] <= 1
    assert build_excel_bytes(settings, players, courts, rounds, diagnostics).startswith(b"PK")


def main() -> None:
    test_standard_schedule()
    test_late_arrivals()
    print("Rooktests geslaagd, inclusief late aankomst.")


if __name__ == "__main__":
    main()
