from dataclasses import replace
from datetime import time
import pytest
import planner


def inputs(seed=2026):
    players = [planner.Player(f"P{i:02}", r, time(20), time(22))
               for i, r in enumerate([5,3,3,1,4,4,3,3,4,2,4,2])]
    settings = planner.PlannerSettings(time(20), time(22), 20, 5, 14, 3, 8,
                                      True, 100, 1, seed, 13)
    return players, ["Kremer", "ZGA/F&F", "PlaySeat"], settings


@pytest.mark.parametrize("seed", [2026,2027,2028])
def test_first_complete_survives_slow_optimization_and_replays(monkeypatch, seed):
    now = [0.0]
    monkeypatch.setattr(planner, "monotonic", lambda: now[0])
    extend = planner._extend_state
    after_complete = [0]
    def slow(*args):
        state = extend(*args)
        if len(state.rounds) == 5:
            now[0] = 14
            after_complete[0] += 1
        return state
    monkeypatch.setattr(planner, "_extend_state", slow)
    players, courts, settings = inputs(seed)
    rounds, diagnostics = planner.generate_schedule(players, courts, settings)
    assert len(rounds) == 5
    assert diagnostics["optimization_completed"] is False
    assert after_complete[0] <= 8
    checkpoint = tuple(diagnostics["search_checkpoint"])
    monkeypatch.setattr(planner, "_extend_state", extend)
    now[0] = 100  # unrelated wall-clock/CPU conditions
    replay, replay_diagnostics = planner.generate_schedule(players, courts, settings, replay_checkpoint=checkpoint)
    assert replay == rounds
    assert replay_diagnostics["quality_summary"] == diagnostics["quality_summary"]
    assert replay_diagnostics["score"] == diagnostics["score"]


def test_no_complete_result_is_typed_deadline(monkeypatch):
    ticks = iter([0, 20])
    monkeypatch.setattr(planner, "monotonic", lambda: next(ticks))
    with pytest.raises(planner.SearchDeadlineReached):
        planner.generate_schedule(*inputs())


def test_replay_never_falls_back_to_other_result():
    players,courts,settings = inputs()
    with pytest.raises(planner.InvalidSearchCheckpoint):
        planner.generate_schedule(players,courts,replace(settings, search_restarts=1), replay_checkpoint=(0,1))


def test_structural_validation_precedes_deadline(monkeypatch):
    monkeypatch.setattr(planner,"monotonic",lambda: 0)
    players,courts,settings=inputs()
    with pytest.raises(planner.PlannerInputError):
        planner.generate_schedule(players[:11],courts,settings)
