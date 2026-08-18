"""Compatibiliteitstests voor optionele importmetadata in de handmatige plannerflow."""

from datetime import time

import pandas as pd

from planner import Player
from streamlit_app import (
    IMPORT_METADATA_FIELDS,
    _players_dataframe,
    _prepare_player_master,
    _private_player_records,
    _serialize_editor_rows,
)


def test_legacy_draft_rows_without_member_id_remain_valid() -> None:
    legacy = [
        {
            "Naam": "Handmatig",
            "Ranking": 4,
            "Meedoen": True,
            "Vanaf tijd": None,
            "Tot tijd": None,
        }
    ]

    frame = _players_dataframe(legacy)
    master = _prepare_player_master(frame)
    serialized = _serialize_editor_rows(master)

    assert serialized == legacy
    assert all(field in master.columns for field in IMPORT_METADATA_FIELDS)


def test_import_identity_metadata_survives_manual_editor_roundtrip() -> None:
    imported = [
        {
            "Naam": "Alex",
            "Ranking": 3,
            "Meedoen": True,
            "Vanaf tijd": "20:30",
            "Tot tijd": "21:30",
            "member_id": "member-a",
            "user_id": "user-a",
            "registration_id": "registration-a",
            "registration_updated_at": "2026-08-18T12:00:00+00:00",
            "source_event_id": "event-a",
        }
    ]

    frame = _players_dataframe(imported)
    master = _prepare_player_master(frame)
    master.loc[0, "Ranking"] = 4
    serialized = _serialize_editor_rows(master)

    assert serialized[0]["member_id"] == "member-a"
    assert serialized[0]["registration_id"] == "registration-a"
    assert serialized[0]["Ranking"] == 4
    assert serialized[0]["Vanaf tijd"] == "20:30"
    assert serialized[0]["Tot tijd"] == "21:30"


def test_private_schedule_players_keep_member_id_without_changing_planner_player() -> None:
    data = pd.DataFrame(
        [
            {
                "Naam": "Alex",
                "Ranking": 3,
                "Meedoen": True,
                "Vanaf tijd": time(20, 30),
                "Tot tijd": None,
                "member_id": "member-a",
                "user_id": "user-a",
                "registration_id": "registration-a",
                "registration_updated_at": "revision-a",
                "source_event_id": "event-a",
            },
            {
                "Naam": "Handmatig",
                "Ranking": 4,
                "Meedoen": True,
                "Vanaf tijd": None,
                "Tot tijd": None,
            },
        ]
    )
    players = [
        Player("Alex", 3, available_from=time(20, 30)),
        Player("Handmatig", 4),
    ]

    records = _private_player_records(players, data)

    assert records[0]["member_id"] == "member-a"
    assert records[0]["source_event_id"] == "event-a"
    assert "member_id" not in records[1]
