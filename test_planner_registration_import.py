"""Tests voor de pure preview-, tijdzone- en mergeadapter voor D3."""

from copy import deepcopy
from datetime import time

import pytest

from planner_registration_import import (
    STATUS_APPROVAL,
    STATUS_DECLINED,
    STATUS_LEGACY_NAME_CONFLICT,
    STATUS_MEMBER_INACTIVE,
    STATUS_PADEL_INACTIVE,
    STATUS_RANKING_MISSING,
    STATUS_UNCHANGED,
    STATUS_UPDATE,
    PlannerRegistrationImportError,
    build_registration_import_preview,
    merge_registration_import,
)


def _event(**overrides: object) -> dict[str, object]:
    event: dict[str, object] = {
        "id": "event-padel",
        "sport": "padel",
        "starts_at": "2026-08-28T18:00:00+00:00",
        "ends_at": "2026-08-28T20:00:00+00:00",
    }
    event.update(overrides)
    return event


def _registration(**overrides: object) -> dict[str, object]:
    registration: dict[str, object] = {
        "id": "registration-a",
        "event_id": "event-padel",
        "user_id": "user-a",
        "member_id": "member-a",
        "display_name": "Alex",
        "response": "attending",
        "available_from": "2026-08-28T18:00:00+00:00",
        "available_until": "2026-08-28T20:00:00+00:00",
        "approval_status": "approved",
        "member_active": True,
        "padel_profile_active": True,
        "padel_ranking": 3,
        "updated_at": "2026-08-18T12:00:00+00:00",
    }
    registration.update(overrides)
    return registration


def test_eligible_attending_registration_is_ready_with_identity_metadata() -> None:
    preview = build_registration_import_preview(_event(), [_registration()])
    candidate = preview.candidates[0]

    assert preview.attending_count == preview.ready_count == 1
    assert preview.blocked_count == preview.declined_count == 0
    assert candidate.importable
    assert candidate.planner_row == {
        "Naam": "Alex",
        "Ranking": 3,
        "Meedoen": True,
        "Vanaf tijd": None,
        "Tot tijd": None,
        "member_id": "member-a",
        "user_id": "user-a",
        "registration_id": "registration-a",
        "registration_updated_at": "2026-08-18T12:00:00+00:00",
        "source_event_id": "event-padel",
    }


def test_declined_registration_is_not_imported_or_removed() -> None:
    existing = [{"Naam": "Alex", "member_id": "member-a", "Meedoen": True}]
    preview = build_registration_import_preview(
        _event(),
        [
            _registration(
                response="declined",
                available_from=None,
                available_until=None,
            )
        ],
        existing,
    )
    result = merge_registration_import(existing, preview)

    assert preview.candidates[0].status == STATUS_DECLINED
    assert preview.declined_count == 1
    assert list(result.rows) == existing
    assert result.skipped[0][0] == "Alex"


@pytest.mark.parametrize("approval", ["pending", "rejected"])
def test_unapproved_member_is_blocked(approval: str) -> None:
    candidate = build_registration_import_preview(
        _event(),
        [_registration(approval_status=approval)],
    ).candidates[0]
    assert candidate.status == STATUS_APPROVAL
    assert not candidate.importable


@pytest.mark.parametrize(
    ("overrides", "expected_status"),
    [
        ({"member_active": False}, STATUS_MEMBER_INACTIVE),
        ({"padel_profile_active": False}, STATUS_PADEL_INACTIVE),
        ({"padel_ranking": None}, STATUS_RANKING_MISSING),
    ],
)
def test_member_and_ranking_blockades_are_reported(
    overrides: dict[str, object],
    expected_status: str,
) -> None:
    candidate = build_registration_import_preview(
        _event(),
        [_registration(**overrides)],
    ).candidates[0]
    assert candidate.status == expected_status
    assert not candidate.importable


def test_late_arrival_and_early_departure_use_amsterdam_local_time() -> None:
    candidate = build_registration_import_preview(
        _event(),
        [
            _registration(
                available_from="2026-08-28T18:30:00+00:00",
                available_until="2026-08-28T19:30:00+00:00",
            )
        ],
    ).candidates[0]

    assert candidate.available_from == time(20, 30)
    assert candidate.available_until == time(21, 30)
    assert candidate.planner_row["Vanaf tijd"] == "20:30"  # type: ignore[index]
    assert candidate.planner_row["Tot tijd"] == "21:30"  # type: ignore[index]


def test_winter_timezone_conversion_uses_cet_instead_of_summer_time() -> None:
    candidate = build_registration_import_preview(
        _event(
            starts_at="2026-12-18T19:00:00+00:00",
            ends_at="2026-12-18T21:00:00+00:00",
        ),
        [
            _registration(
                available_from="2026-12-18T19:30:00+00:00",
                available_until="2026-12-18T20:30:00+00:00",
            )
        ],
    ).candidates[0]
    assert candidate.available_from == time(20, 30)
    assert candidate.available_until == time(21, 30)


def test_import_is_idempotent_for_the_same_event_registration() -> None:
    first_preview = build_registration_import_preview(_event(), [_registration()])
    first = merge_registration_import([], first_preview)
    second_preview = build_registration_import_preview(
        _event(),
        [_registration()],
        first.rows,
    )
    second = merge_registration_import(first.rows, second_preview)

    assert len(first.rows) == len(second.rows) == 1
    assert second_preview.candidates[0].status == STATUS_UNCHANGED
    assert second.unchanged == 1
    assert second.added == second.updated == 0


def test_manual_and_legacy_rows_remain_unchanged() -> None:
    manual = {"Naam": "Handmatig", "Ranking": 4, "Meedoen": False}
    preview = build_registration_import_preview(_event(), [_registration()], [manual])
    result = merge_registration_import([manual], preview)

    assert result.rows[0] == manual
    assert result.rows[1]["member_id"] == "member-a"


def test_legacy_name_match_is_warning_not_silent_identity_merge() -> None:
    legacy = {"Naam": " Alex ", "Ranking": 2, "Meedoen": True}
    preview = build_registration_import_preview(_event(), [_registration()], [legacy])
    result = merge_registration_import([legacy], preview)

    assert preview.candidates[0].status == STATUS_LEGACY_NAME_CONFLICT
    assert preview.ready_count == 0
    assert list(result.rows) == [legacy]


def test_changed_registration_and_ranking_are_explicit_reimport_updates() -> None:
    first = merge_registration_import(
        [],
        build_registration_import_preview(_event(), [_registration()]),
    )
    changed = _registration(
        available_from="2026-08-28T18:30:00+00:00",
        padel_ranking=4,
        updated_at="2026-08-19T09:00:00+00:00",
    )
    preview = build_registration_import_preview(_event(), [changed], first.rows)
    result = merge_registration_import(first.rows, preview)

    assert preview.candidates[0].status == STATUS_UPDATE
    assert result.updated == 1
    assert result.rows[0]["Ranking"] == 4
    assert result.rows[0]["Vanaf tijd"] == "20:30"


def test_unknown_manual_fields_survive_controlled_reimport() -> None:
    current = dict(
        build_registration_import_preview(
            _event(),
            [_registration()],
        ).candidates[0].planner_row
    )
    current["handmatige_notitie"] = "bewaren"
    changed = deepcopy(_registration(padel_ranking=4))
    result = merge_registration_import(
        [current],
        build_registration_import_preview(_event(), [changed], [current]),
    )
    assert result.rows[0]["handmatige_notitie"] == "bewaren"


def test_tennis_event_cannot_use_the_padelplanner_import() -> None:
    with pytest.raises(PlannerRegistrationImportError, match="Alleen padel-events"):
        build_registration_import_preview(
            _event(sport="tennis"),
            [_registration()],
        )
