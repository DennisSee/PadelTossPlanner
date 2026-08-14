"""Rooktests voor pauzes en individuele beschikbaarheid in de TOS-planner."""

from datetime import time

from planner import Player, PlannerSettings, generate_schedule, round_times, schedule_rows


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
        assert not set(active_players).intersection(round_plan.unavailable_after)


def _players() -> list[Player]:
    return [
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


def test_pause_between_matches() -> None:
    players = _players()
    courts = ["Kremer Baan", "ZGA/F&F Baan"]
    settings = PlannerSettings(
        start_time=time(20, 0),
        end_time=time(22, 0),
        match_minutes=20,
        rest_minutes=5,
        search_restarts=4,
        beam_width=12,
        candidates_per_state=70,
    )

    rounds, diagnostics = generate_schedule(players, courts, settings)
    assert len(rounds) == 5
    assert diagnostics["rest_minutes"] == 5
    assert diagnostics["unused_minutes"] == 0
    assert round_times(settings, 0)[0].strftime("%H:%M") == "20:00"
    assert round_times(settings, 1)[0].strftime("%H:%M") == "20:25"
    assert round_times(settings, 4)[1].strftime("%H:%M") == "22:00"
    _assert_basic_rules(rounds, courts)


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
    _assert_basic_rules(rounds, courts)

    late = {"Trever", "Niels"}
    for round_plan in rounds[:3]:
        assert set(round_plan.unavailable) == late
        assert not round_plan.unavailable_after
    for round_plan in rounds[3:]:
        assert not round_plan.unavailable

    assert diagnostics["unavailable_counts"]["Trever"] == 3


def test_early_departures() -> None:
    players = [
        Player("Dennis", 4),
        Player("Marieke", 3),
        Player("Peter", 5),
        Player("Anita", 2),
        Player("Bjorn", 3),
        Player("Jeroen", 4),
        Player("Jim", 2),
        Player("Frans", 3),
        Player("Trever", 5, available_until=time(21, 0)),
        Player("Niels", 3, available_until=time(21, 0)),
    ]
    courts = ["Kremer Baan", "ZGA/F&F Baan"]
    settings = PlannerSettings(
        start_time=time(20, 0),
        end_time=time(22, 0),
        match_minutes=20,
        search_restarts=7,
        beam_width=16,
        candidates_per_state=85,
    )

    rounds, diagnostics = generate_schedule(players, courts, settings)
    _assert_basic_rules(rounds, courts)

    leaving = {"Trever", "Niels"}
    for round_plan in rounds[:3]:
        assert not round_plan.unavailable_after
    for round_plan in rounds[3:]:
        assert set(round_plan.unavailable_after) == leaving
        assert not set(round_plan.rest).intersection(leaving)

    rows = schedule_rows(rounds, courts, players, settings)
    assert rows[-1]["Niet meer beschikbaar"] in {"Niels, Trever", "Trever, Niels"}
    assert diagnostics["unavailable_after_counts"]["Trever"] == 3
    assert set(diagnostics["early_leave_players"]) == leaving


def test_level_mix_control() -> None:
    players = [
        *(Player(f"Sterk {index}", 5) for index in range(1, 5)),
        *(Player(f"Midden {index}", 3) for index in range(1, 5)),
        *(Player(f"Lager {index}", 2) for index in range(1, 5)),
    ]
    courts = ["Baan 1", "Baan 2", "Baan 3"]

    strict_settings = PlannerSettings(
        start_time=time(20, 0),
        end_time=time(20, 20),
        match_minutes=20,
        search_restarts=6,
        beam_width=14,
        candidates_per_state=80,
        level_mix=0,
    )
    mixed_settings = PlannerSettings(
        start_time=time(20, 0),
        end_time=time(20, 20),
        match_minutes=20,
        search_restarts=6,
        beam_width=14,
        candidates_per_state=80,
        level_mix=100,
    )

    strict_rounds, _ = generate_schedule(players, courts, strict_settings)
    mixed_rounds, mixed_diagnostics = generate_schedule(players, courts, mixed_settings)
    ranks = {player.name: player.ranking for player in players}

    def mixed_courts(rounds) -> int:
        return sum(
            len({ranks[name] for name in (*match.team1, *match.team2)}) > 1
            for round_plan in rounds
            for match in round_plan.matches
        )

    assert mixed_courts(mixed_rounds) > mixed_courts(strict_rounds)
    assert mixed_diagnostics["level_mix"] == 100


def main() -> None:
    test_pause_between_matches()
    test_late_arrivals()
    test_early_departures()
    test_level_mix_control()
    print("Rooktests geslaagd: pauzes, late aankomst, eerder vertrek en niveaumix.")


if __name__ == "__main__":
    main()
