"""Regressies voor structureel geldige best-effort TOS-schema's."""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import replace
from datetime import time

import pytest

from planner import (
    PlannerInputError,
    PlannerSettings,
    Player,
    _match_penalty,
    calculate_rounds,
    generate_schedule,
    pair_key,
    round_times,
    schedule_rows,
)


COURTS = ["Baan 1", "Baan 2", "Baan 3"]


def players(count: int) -> list[Player]:
    return [Player(f"Testspeler {index:02d}", ((index - 1) % 5) + 1) for index in range(1, count + 1)]


def settings(*, rest_minutes: int = 0, allow_repeat_partners: bool = False) -> PlannerSettings:
    return PlannerSettings(
        start_time=time(20),
        end_time=time(22),
        match_minutes=20,
        rest_minutes=rest_minutes,
        search_restarts=8,
        beam_width=12,
        candidates_per_state=70,
        allow_repeat_partners=allow_repeat_partners,
        level_mix=100,
        team_difference_tolerance=0.5,
        random_seed=2026,
    )


def assert_structurally_valid(
    rounds,
    selected_players: list[Player],
    courts: list[str],
    planner_settings: PlannerSettings,
) -> None:
    allowed = {player.name for player in selected_players}
    previous_end = None
    for round_index, round_plan in enumerate(rounds):
        start, end = round_times(planner_settings, round_index)
        assert start < end
        assert previous_end is None or start >= previous_end
        previous_end = end
        assert len(round_plan.matches) == len(courts)
        playing: list[str] = []
        for match in round_plan.matches:
            names = [*match.team1, *match.team2]
            assert len(names) == len(set(names)) == 4
            assert set(names) <= allowed
            playing.extend(names)
        assert len(playing) == len(set(playing)) == len(courts) * 4
        assert not set(playing).intersection(round_plan.rest)
        assert not set(playing).intersection(round_plan.unavailable)
        assert not set(playing).intersection(round_plan.unavailable_after)

    rows = schedule_rows(rounds, courts, selected_players, planner_settings)
    court_slots = [(row["Ronde"], row["Baan"]) for row in rows]
    assert len(court_slots) == len(set(court_slots))
    assert {row["Baan"] for row in rows} <= set(courts)
    assert len(rows) == len(rounds) * len(courts)


def repeated_pairs(rounds, *, opponents: bool) -> int:
    counts: Counter[tuple[str, str]] = Counter()
    for round_plan in rounds:
        for match in round_plan.matches:
            if opponents:
                for first in match.team1:
                    for second in match.team2:
                        counts[pair_key(first, second)] += 1
            else:
                counts[pair_key(*match.team1)] += 1
                counts[pair_key(*match.team2)] += 1
    return sum(max(0, count - 1) for count in counts.values())


def test_twelve_players_generate_six_rounds_without_pause_and_five_with_pause() -> None:
    selected = players(12)
    no_pause_settings = settings(rest_minutes=0)
    with_pause_settings = settings(rest_minutes=5)
    no_pause, no_pause_diagnostics = generate_schedule(selected, COURTS, no_pause_settings)
    with_pause, with_pause_diagnostics = generate_schedule(selected, COURTS, with_pause_settings)

    assert calculate_rounds(settings(rest_minutes=0))[0] == len(no_pause) == 6
    assert calculate_rounds(settings(rest_minutes=5))[0] == len(with_pause) == 5
    assert_structurally_valid(no_pause, selected, COURTS, no_pause_settings)
    assert_structurally_valid(with_pause, selected, COURTS, with_pause_settings)

    no_pause_quality = no_pause_diagnostics["quality_summary"]
    with_pause_quality = with_pause_diagnostics["quality_summary"]
    assert no_pause_quality["partner_repeats"] == repeated_pairs(no_pause, opponents=False) == 0
    assert no_pause_quality["opponent_repeats"] == repeated_pairs(no_pause, opponents=True)
    assert no_pause_quality["opponent_repeats"] >= 6
    no_pause_rows = schedule_rows(no_pause, COURTS, selected, no_pause_settings)
    assert no_pause_quality["max_team_difference"] == max(
        row["Teamverschil"] for row in no_pause_rows
    )
    assert with_pause_quality["opponent_repeats"] <= no_pause_quality["opponent_repeats"]


def test_partner_repeat_setting_is_a_soft_preference_in_both_modes() -> None:
    ranks = {"Ada": 3.0, "Bea": 3.0, "Cleo": 3.0, "Dora": 3.0}
    previous = Counter({pair_key("Ada", "Bea"): 1})
    avoid_penalty = _match_penalty(
        ("Ada", "Bea"), ("Cleo", "Dora"), ranks, previous, Counter(), False, 50, 0.5
    )
    allowed_penalty = _match_penalty(
        ("Ada", "Bea"), ("Cleo", "Dora"), ranks, previous, Counter(), True, 50, 0.5
    )
    assert math.isfinite(avoid_penalty)
    assert math.isfinite(allowed_penalty)
    assert avoid_penalty > allowed_penalty > 0

    selected = players(4)
    four_rounds = PlannerSettings(
        start_time=time(20), end_time=time(21, 20), match_minutes=20,
        search_restarts=4, beam_width=8, candidates_per_state=45,
        allow_repeat_partners=False, random_seed=19,
    )
    rounds, diagnostics = generate_schedule(selected, ["Baan 1"], four_rounds)
    assert len(rounds) == 4
    assert diagnostics["quality_summary"]["partner_repeats"] > 0
    assert_structurally_valid(rounds, selected, ["Baan 1"], four_rounds)


def test_opponent_level_mix_and_team_tolerance_are_scoring_not_rejection() -> None:
    ranks = {"Ada": 1.0, "Bea": 1.0, "Cleo": 5.0, "Dora": 5.0}
    strict = _match_penalty(
        ("Ada", "Bea"), ("Cleo", "Dora"), ranks, Counter(), Counter(), False, 0, 0.0
    )
    permissive = _match_penalty(
        ("Ada", "Bea"), ("Cleo", "Dora"), ranks, Counter(), Counter(), False, 100, 1.5
    )
    assert math.isfinite(strict)
    assert math.isfinite(permissive)
    assert strict != permissive


def test_fifteen_players_get_fair_rest_without_quality_failure() -> None:
    selected = players(15)
    planner_settings = settings(rest_minutes=0)
    planner_settings = replace(planner_settings, level_mix=80)
    rounds, diagnostics = generate_schedule(selected, COURTS, planner_settings)
    assert len(rounds) == 6
    assert_structurally_valid(rounds, selected, COURTS, planner_settings)
    rest_counts = diagnostics["rest_counts"]
    assert sum(rest_counts.values()) == 18
    assert set(rest_counts.values()) == {1, 2}
    assert diagnostics["quality_summary"]["max_rest_difference"] == 1


def test_consecutive_rest_is_penalized_but_not_structurally_rejected() -> None:
    selected = players(9)
    rounds, diagnostics = generate_schedule(selected, ["Baan 1"], settings(rest_minutes=0))
    assert len(rounds) == 6
    assert_structurally_valid(rounds, selected, ["Baan 1"], settings(rest_minutes=0))
    assert any(set(previous.rest).intersection(current.rest) for previous, current in zip(rounds, rounds[1:]))
    assert diagnostics["quality_summary"]["max_rest_difference"] <= 1


def test_structural_shortage_still_fails_closed() -> None:
    with pytest.raises(PlannerInputError) as failure:
        generate_schedule(players(11), COURTS, settings())
    assert failure.value.code == "INSUFFICIENT_PLAYERS"
