import pytest
from fastapi.testclient import TestClient

from app import main as main_module
from app.main import app


def payload() -> dict[str, object]:
    return {
        "players": [
            {
                "name": f"Speler {index}",
                "ranking": (index % 5) + 1,
                "available_from": "20:00",
                "available_until": "22:00",
            }
            for index in range(1, 9)
        ],
        "courts": ["Kremer Baan", "ZGA/F&F Baan"],
        "start_time": "20:00",
        "end_time": "22:00",
        "match_minutes": 20,
        "rest_minutes": 0,
        "search_profile": "Snel",
        "allow_repeat_partners": False,
        "level_mix": 50,
        "tolerance": 0.5,
        "generation_seed": 20260821,
    }


def test_generate_is_deterministic_and_json_safe() -> None:
    with TestClient(app, base_url="http://planner-api.test") as client:
        first = client.post("/generate", json=payload())
        second = client.post("/generate", json=payload())
    assert first.status_code == 200
    assert first.json() == second.json()
    assert set(first.json()) == {"seed", "schedule", "statistics", "diagnostics"}
    assert first.json()["seed"] == 20260821
    assert first.json()["schedule"]
    assert set(first.json()["diagnostics"]["quality_summary"]) == {
        "partner_repeats", "opponent_repeats", "max_rest_difference",
        "max_team_difference", "compromises",
    }


@pytest.mark.parametrize("allowed", [False, True])
def test_generate_preserves_partner_repeat_preference(
    monkeypatch: pytest.MonkeyPatch, allowed: bool
) -> None:
    seen: list[bool] = []

    def capture(_players: object, _courts: object, settings: object):
        seen.append(settings.allow_repeat_partners)
        return [], {"quality_summary": {
            "partner_repeats": 0, "opponent_repeats": 0,
            "max_rest_difference": 0, "max_team_difference": 0,
            "compromises": [],
        }}

    monkeypatch.setattr(main_module, "generate_schedule", capture)
    monkeypatch.setattr(main_module, "schedule_rows", lambda *_args: [])
    monkeypatch.setattr(main_module, "player_statistics", lambda *_args: [])
    value = payload()
    value["allow_repeat_partners"] = allowed
    with TestClient(app) as client:
        response = client.post("/generate", json=value)
    assert response.status_code == 200
    assert seen == [allowed]


def test_generate_twelve_players_three_courts_without_pause() -> None:
    value = payload()
    value["players"] = [
        {
            "name": f"Speler {index:02d}", "ranking": ((index - 1) % 5) + 1,
            "available_from": "20:00", "available_until": "22:00",
        }
        for index in range(1, 13)
    ]
    value.update({
        "courts": ["Baan 1", "Baan 2", "Baan 3"], "search_profile": "Normaal",
        "level_mix": 100, "tolerance": 0.5,
    })
    with TestClient(app) as client:
        response = client.post("/generate", json=value)
    assert response.status_code == 200
    body = response.json()
    assert len(body["schedule"]) == 18
    assert body["diagnostics"]["rounds"] == 6
    assert body["diagnostics"]["quality_summary"]["opponent_repeats"] >= 6


def test_generate_supports_midnight_and_minute_precision() -> None:
    value = payload()
    value.update({"start_time": "23:47", "end_time": "01:27", "match_minutes": 20})
    for player in value["players"]:
        player.update({"available_from": "23:47", "available_until": "01:27"})
    with TestClient(app) as client:
        response = client.post("/generate", json=value)
    assert response.status_code == 200


def test_generate_accepts_server_resolved_courts_and_rejects_unsafe_values() -> None:
    with TestClient(app) as client:
        extra = payload() | {"event_id": "private"}
        failure = client.post("/generate", json=extra).json()
        assert failure["error"] == "INVALID_PLANNER_INPUT"
        assert failure["diagnostics"][0]["code"] == "INVALID_CONFIGURATION"
        tennis = payload()
        tennis["courts"] = ["Tennisbaan Noord", "Tennisbaan Zuid"]
        assert client.post("/generate", json=tennis).status_code == 200
        unsafe = payload()
        unsafe["courts"] = ["Tennisbaan\nNoord"]
        assert client.post("/generate", json=unsafe).status_code == 422
        duplicate = payload()
        duplicate["players"][1]["name"] = "speler 1"
        assert client.post("/generate", json=duplicate).status_code == 422


def test_generate_returns_structured_finite_errors_without_engine_details() -> None:
    value = payload()
    value["players"] = value["players"][:4]
    value["courts"] = ["Kremer Baan", "ZGA/F&F Baan"]
    with TestClient(app) as client:
        response = client.post("/generate", json=value)
    assert response.status_code == 422
    body = response.json()
    assert body["error"] == "INVALID_PLANNER_INPUT"
    assert body["probes_run"] == 0
    assert body["diagnostics"][0]["code"] == "INSUFFICIENT_PLAYERS"
    assert body["diagnostics"][0]["current_value"] is None
    assert "private" not in response.text.lower()


def test_unexpected_diagnostic_failure_remains_a_finite_server_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def generation_failure(*_args: object) -> None:
        raise RuntimeError("private generation detail")

    monkeypatch.setattr(main_module, "generate_schedule", generation_failure)
    with TestClient(app) as client:
        response = client.post("/generate", json=payload())
    assert response.status_code == 500
    assert response.json() == {"error": "PLANNER_INTERNAL_ERROR"}
    assert "private" not in response.text.lower()
