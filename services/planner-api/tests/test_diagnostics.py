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


def test_extended_search_probe_isolated_and_original_settings_unchanged() -> None:
    original = settings()
    seen: list[PlannerSettings] = []

    def generator(_players: object, _courts: object, probed: PlannerSettings):
        seen.append(probed)
        if probed.search_restarts == 14:
            return [], {}
        raise RuntimeError("no solution")

    failure = diagnose_search_failure(players(), ["Baan 1", "Baan 2"], original, "Snel", generator)
    assert [item.code for item in failure.diagnostics] == ["SEARCH_BUDGET_TOO_SMALL"]
    assert failure.diagnostics[0].current_value == "Snel"
    assert failure.diagnostics[0].suggested_value == "Uitgebreid"
    assert original.search_restarts == 4
    assert all(probe is not original for probe in seen)
    assert original.level_mix == 80
    assert original.team_difference_tolerance == 0.5
    assert original.allow_repeat_partners is False


def test_different_seed_has_its_own_truthful_reason() -> None:
    def generator(_players: object, _courts: object, probed: PlannerSettings):
        if probed.random_seed != 27 and probed.search_restarts == 4:
            return [], {}
        raise RuntimeError("no solution")

    failure = diagnose_search_failure(players(), ["Baan 1", "Baan 2"], settings(), "Snel", generator)
    assert [item.code for item in failure.diagnostics] == ["DIFFERENT_SEED_MAY_HELP"]
    assert failure.diagnostics[0].suggested_change == "Genereer opnieuw om een andere geldige indeling te proberen."


def test_two_successful_probes_stop_early_and_remain_bounded() -> None:
    calls = 0

    def generator(_players: object, _courts: object, probed: PlannerSettings):
        nonlocal calls
        calls += 1
        if probed.search_restarts == 14 or probed.random_seed != 27:
            return [], {}
        raise RuntimeError("no solution")

    failure = diagnose_search_failure(players(), ["Baan 1", "Baan 2"], settings(), "Snel", generator)
    assert [item.code for item in failure.diagnostics] == [
        "SEARCH_BUDGET_TOO_SMALL",
        "DIFFERENT_SEED_MAY_HELP",
    ]
    assert failure.probes_run == calls == 2


def test_unknown_failure_never_claims_one_specific_setting() -> None:
    failure = diagnose_search_failure(players(), ["Baan 1", "Baan 2"], settings(), "Snel", failed)
    assert failure.probes_run == 2
    assert [item.code for item in failure.diagnostics] == ["SEARCH_BUDGET_EXHAUSTED"]
    assert failure.diagnostics[0].severity == "unknown"
    assert "niveaumix" not in failure.diagnostics[0].message.lower()
    assert "teamtolerantie" not in failure.diagnostics[0].message.lower()


def test_extended_profile_only_retries_with_a_new_seed() -> None:
    seen: list[PlannerSettings] = []

    def generator(_players: object, _courts: object, probed: PlannerSettings):
        seen.append(probed)
        raise RuntimeError("no solution")

    failure = diagnose_search_failure(players(), ["Baan 1", "Baan 2"], settings(), "Uitgebreid", generator)
    assert failure.probes_run == 1
    assert len(seen) == 1
    assert seen[0].random_seed == settings().random_seed + 104_729
