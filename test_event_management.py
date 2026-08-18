"""Tests voor eventvalidatie, stabiele slugs en veilige deelbare links."""

from datetime import date, time
from urllib.parse import parse_qs, urlsplit

import pytest

from event_management import (
    EVENT_STATUSES,
    EventManagementError,
    build_event_payload,
    build_event_update_payload,
    build_signup_url,
    generate_event_slug,
    immutable_event_fields_changed,
    public_base_url_from_secrets,
)


def _payload(*, sport: str = "padel", status: str = "draft") -> dict[str, object]:
    return build_event_payload(
        sport=sport,
        title="TOS-avond",
        event_date=date(2099, 8, 28),
        starts_at=time(20, 0),
        ends_at=time(22, 0),
        signup_deadline_enabled=True,
        signup_deadline_date=date(2099, 8, 28),
        signup_deadline_time=time(19, 0),
        status=status,
    )


@pytest.mark.parametrize("sport", ["padel", "tennis"])
def test_valid_padel_and_tennis_events_are_normalized_to_timestamptz(
    sport: str,
) -> None:
    payload = _payload(sport=sport)
    assert payload["sport"] == sport
    assert payload["starts_at"] == "2099-08-28T18:00:00+00:00"
    assert payload["ends_at"] == "2099-08-28T20:00:00+00:00"
    assert payload["signup_deadline"] == "2099-08-28T17:00:00+00:00"


def test_invalid_sport_time_range_and_deadline_are_rejected() -> None:
    with pytest.raises(EventManagementError, match="padel of tennis"):
        _payload(sport="badminton")

    with pytest.raises(EventManagementError, match="eindtijd"):
        build_event_payload(
            sport="padel",
            title="TOS",
            event_date=date(2099, 8, 28),
            starts_at=time(22, 0),
            ends_at=time(20, 0),
            signup_deadline_enabled=False,
            signup_deadline_date=date(2099, 8, 28),
            signup_deadline_time=time(19, 0),
            status="draft",
        )

    with pytest.raises(EventManagementError, match="deadline"):
        build_event_payload(
            sport="padel",
            title="TOS",
            event_date=date(2099, 8, 28),
            starts_at=time(20, 0),
            ends_at=time(22, 0),
            signup_deadline_enabled=True,
            signup_deadline_date=date(2099, 8, 28),
            signup_deadline_time=time(20, 5),
            status="draft",
        )


@pytest.mark.parametrize("status", EVENT_STATUSES)
def test_all_v1_statuses_are_accepted(status: str) -> None:
    assert _payload(status=status)["status"] == status


def test_slug_is_url_safe_unique_and_independent_from_title() -> None:
    first = generate_event_slug(
        "padel",
        date(2099, 8, 28),
        unique_token="abc12345",
    )
    same_inputs = generate_event_slug(
        "padel",
        date(2099, 8, 28),
        unique_token="abc12345",
    )
    second = generate_event_slug(
        "padel",
        date(2099, 8, 28),
        unique_token="def67890",
    )

    assert first == same_inputs == "padel-tos-20990828-abc12345"
    assert second != first
    assert "tos-avond" not in first


def test_signup_url_contains_only_the_internal_signup_context() -> None:
    url = build_signup_url(
        "https://app.example/club/",
        "padel-tos-20990828-abc12345",
    )
    parsed = urlsplit(url)
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == (
        "https://app.example/club/"
    )
    assert parse_qs(parsed.query) == {
        "page": ["signup"],
        "event": ["padel-tos-20990828-abc12345"],
    }
    assert not parsed.fragment
    assert public_base_url_from_secrets(
        {"app": {"public_base_url": "http://localhost:8501"}}
    ) == "http://localhost:8501/"


def test_public_base_url_rejects_remote_http_and_query_parameters() -> None:
    for unsafe_url in (
        "http://app.example/",
        "https://app.example/?token=unsafe",
        "https://user:password@app.example/",
    ):
        with pytest.raises(EventManagementError):
            public_base_url_from_secrets(
                {"app": {"public_base_url": unsafe_url}}
            )


def test_existing_structural_fields_are_immutable_but_title_deadline_can_change() -> None:
    existing = {
        **_payload(),
        "slug": "padel-tos-20990828-abc12345",
    }
    assert immutable_event_fields_changed(existing, {"sport": "tennis"})
    assert immutable_event_fields_changed(
        existing,
        {"starts_at": "2099-08-28T18:30:00+00:00"},
    )
    assert not immutable_event_fields_changed(existing, {"title": "Nieuwe titel"})

    update = build_event_update_payload(
        existing,
        title="Nieuwe titel",
        signup_deadline_enabled=False,
        signup_deadline_date=date(2099, 8, 28),
        signup_deadline_time=time(19, 0),
    )
    assert update == {"title": "Nieuwe titel", "signup_deadline": None}
