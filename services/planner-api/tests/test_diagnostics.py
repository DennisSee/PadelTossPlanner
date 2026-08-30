from __future__ import annotations

from datetime import time

from planner import PlannerInputError, PlannerSettings, Player

from app.diagnostics import diagnose_search_failure, input_failure


def players() -> list[Player]:
    return [Player(f"Testspeler {index}", (index % 5) + 1) for index in range(1, 9)]


def settings() -> PlannerSettings:
    return PlannerSettings(
        start_time=time(20),
        end_time=time(22),
        match_minutes=20,
        search_restarts=4,
        beam_width=8,
        candidates_per_state=45,
        level_mix=80,
        team_difference_tolerance=0.5,
        random_seed=27,
    )


def failed(*_args: object) -> None:
    raise RuntimeError("no solution")


def test_preflight_shortage_is_concrete_without_engine_exception_text() -> None:
    failure = input_failure(PlannerInputError(
        "ROUND_PLAYER_SHORTAGE",
        "private engine detail",
        round_time="20:40",
        available_players=7,
        required_players=8,
    ))
    assert failure.code == "INVALID_PLANNER_INPUT"
    assert failure.probes_run == 0
    assert failure.diagnostics[0].code == "AVAILABILITY_SHORTAGE"
    assert "20:40" in failure.diagnostics[0].message
    assert "private engine detail" not in str(failure.json())


def test_level_mix_probe_isolated_and_original_settings_unchanged() -> None:
    original = settings()
    seen: list[PlannerSettings] = []

    def generator(_players: object, _courts: object, probed: PlannerSettings):
        seen.append(probed)
        if probed.level_mix == 100:
            return [], {}
        raise RuntimeError("no solution")

    failure = diagnose_search_failure(players(), ["Baan 1", "Baan 2"], original, "Snel", generator)
    assert [item.code for item in failure.diagnostics] == ["LEVEL_MIX_TOO_RESTRICTIVE"]
    assert failure.diagnostics[0].current_value == 80
    assert failure.diagnostics[0].suggested_value == 100
    assert original.level_mix == 80
    assert all(probe is not original for probe in seen)
    assert all(sum((probe.level_mix != 80, probe.team_difference_tolerance != 0.5,
                        probe.allow_repeat_partners, probe.search_restarts != 4)) == 1 for probe in seen)


def test_team_tolerance_has_its_own_reason() -> None:
    def generator(_players: object, _courts: object, probed: PlannerSettings):
        if probed.team_difference_tolerance == 1.5 and probed.level_mix == 80:
            return [], {}
        raise RuntimeError("no solution")

    failure = diagnose_search_failure(players(), ["Baan 1", "Baan 2"], settings(), "Snel", generator)
    assert [item.code for item in failure.diagnostics] == ["TEAM_TOLERANCE_TOO_RESTRICTIVE"]
    assert failure.diagnostics[0].suggested_change == "Verhoog Teamtolerantie van 0.5 naar 1,5."


def test_two_successful_probes_stop_early_and_remain_bounded() -> None:
    calls = 0

    def generator(_players: object, _courts: object, probed: PlannerSettings):
        nonlocal calls
        calls += 1
        if probed.level_mix == 100 or probed.team_difference_tolerance == 1.5:
            return [], {}
        raise RuntimeError("no solution")

    failure = diagnose_search_failure(players(), ["Baan 1", "Baan 2"], settings(), "Snel", generator)
    assert [item.code for item in failure.diagnostics] == [
        "LEVEL_MIX_TOO_RESTRICTIVE",
        "TEAM_TOLERANCE_TOO_RESTRICTIVE",
    ]
    assert failure.probes_run == calls == 2


def test_expensive_search_probe_is_skipped_after_an_actionable_reason() -> None:
    seen: list[PlannerSettings] = []

    def generator(_players: object, _courts: object, probed: PlannerSettings):
        seen.append(probed)
        if probed.search_restarts == 14:
            raise AssertionError("The extended search probe must stop after an actionable reason.")
        if probed.allow_repeat_partners:
            return [], {}
        raise RuntimeError("no solution")

    failure = diagnose_search_failure(players(), ["Baan 1", "Baan 2"], settings(), "Snel", generator)
    assert [item.code for item in failure.diagnostics] == ["REPEAT_PARTNERS_REQUIRED"]
    assert failure.probes_run == len(seen) == 3


def test_unknown_failure_never_claims_one_specific_setting() -> None:
    failure = diagnose_search_failure(players(), ["Baan 1", "Baan 2"], settings(), "Snel", failed)
    assert failure.probes_run == 4
    assert [item.code for item in failure.diagnostics] == ["COMBINED_OR_SEARCH_LIMIT"]
    assert failure.diagnostics[0].severity == "unknown"
