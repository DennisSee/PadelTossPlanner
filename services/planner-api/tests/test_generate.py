from fastapi.testclient import TestClient

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


def test_generate_supports_midnight_and_minute_precision() -> None:
    value = payload()
    value.update({"start_time": "23:47", "end_time": "01:27", "match_minutes": 20})
    for player in value["players"]:
        player.update({"available_from": "23:47", "available_until": "01:27"})
    with TestClient(app) as client:
        response = client.post("/generate", json=value)
    assert response.status_code == 200


def test_generate_rejects_unknown_fields_courts_and_duplicate_names() -> None:
    with TestClient(app) as client:
        extra = payload() | {"event_id": "private"}
        assert client.post("/generate", json=extra).json() == {"error": "invalid-input"}
        unknown = payload()
        unknown["courts"] = ["Onbekende baan"]
        assert client.post("/generate", json=unknown).status_code == 422
        duplicate = payload()
        duplicate["players"][1]["name"] = "speler 1"
        assert client.post("/generate", json=duplicate).status_code == 422


def test_generate_returns_finite_errors_without_engine_details() -> None:
    value = payload()
    value["players"] = value["players"][:4]
    value["courts"] = ["Kremer Baan", "ZGA/F&F Baan"]
    with TestClient(app) as client:
        response = client.post("/generate", json=value)
    assert response.status_code == 422
    assert response.json() == {"error": "insufficient-players"}
    assert "spelers" not in response.text.lower()
