"""Tests voor de frontend-onafhankelijke C2-registratieflow."""

from datetime import datetime, time, timezone

import pytest

from participant_registration import (
    ParticipantRegistrationError,
    event_allows_self_service,
    event_sport_label,
    format_event_date,
    registration_availability,
    registration_initial_values,
)


def _event(*, sport: str = "padel", status: str = "open") -> dict[str, object]:
    return {
        "sport": sport,
        "status": status,
        "starts_at": "2099-08-28T18:00:00+00:00",
        "ends_at": "2099-08-28T20:00:00+00:00",
        "signup_deadline": "2099-08-27T20:00:00+00:00",
    }


def test_new_registration_defaults_to_the_full_local_event_window() -> None:
    response, available_from, available_until = registration_initial_values(
        _event(),
        None,
    )

    assert response == "attending"
    assert available_from == time(20, 0)
    assert available_until == time(22, 0)
    assert format_event_date(_event()) == "vrijdag 28 augustus 2099"


def test_existing_registration_is_loaded_as_local_form_values() -> None:
    registration = {
        "response": "attending",
        "available_from": "2099-08-28T18:30:00+00:00",
        "available_until": "2099-08-28T19:45:00+00:00",
    }

    assert registration_initial_values(_event(), registration) == (
        "attending",
        time(20, 30),
        time(21, 45),
    )


def test_custom_valid_times_are_normalized_to_utc() -> None:
    assert registration_availability(
        _event(),
        "attending",
        time(20, 30),
        time(21, 45),
    ) == (
        datetime(2099, 8, 28, 18, 30, tzinfo=timezone.utc),
        datetime(2099, 8, 28, 19, 45, tzinfo=timezone.utc),
    )


@pytest.mark.parametrize(
    ("available_from", "available_until"),
    [
        (time(19, 55), time(22, 0)),
        (time(20, 0), time(22, 5)),
        (time(21, 0), time(20, 30)),
    ],
)
def test_times_outside_the_event_are_rejected(
    available_from: time,
    available_until: time,
) -> None:
    with pytest.raises(ParticipantRegistrationError, match="binnen"):
        registration_availability(
            _event(),
            "attending",
            available_from,
            available_until,
        )


def test_declined_always_removes_availability() -> None:
    assert registration_availability(
        _event(),
        "declined",
        time(20, 30),
        time(21, 30),
    ) == (None, None)


def test_deadline_and_event_status_are_checked_client_side_too() -> None:
    before_deadline = datetime(2099, 8, 27, 19, 59, tzinfo=timezone.utc)
    after_deadline = datetime(2099, 8, 27, 20, 1, tzinfo=timezone.utc)

    assert event_allows_self_service(_event(), now=before_deadline)
    assert not event_allows_self_service(_event(), now=after_deadline)
    assert not event_allows_self_service(
        _event(status="closed"),
        now=before_deadline,
    )


@pytest.mark.parametrize(
    ("sport", "label"),
    [("padel", "Padel"), ("tennis", "Tennis")],
)
def test_padel_and_tennis_use_the_same_generic_flow(sport: str, label: str) -> None:
    event = _event(sport=sport)
    assert event_sport_label(event) == label
    assert registration_initial_values(event, None)[0] == "attending"
