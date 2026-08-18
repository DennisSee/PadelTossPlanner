"""Tests voor pure participantdashboard-presentatielogica."""

import pytest

from participant_dashboard import (
    attendee_names_preview,
    event_status_label,
    registration_cta_label,
    registration_event,
    registration_response_label,
    registrations_by_event_id,
)


def test_registration_event_accepts_postgrest_object_and_list_relation() -> None:
    event = {"id": "event-a", "title": "Vrijdag TOS"}
    assert registration_event({"tos_events": event}) == event
    assert registration_event({"tos_events": [event]}) == event
    assert registration_event({"tos_events": []}) == {}


def test_registration_labels_are_clear_for_participants() -> None:
    assert registration_response_label("attending") == "Ik doe mee"
    assert registration_response_label("declined") == "Ik doe niet mee"
    assert event_status_label("open") == "Open voor inschrijving"
    assert event_status_label("closed") == "Inschrijving gesloten"
    assert event_status_label("cancelled") == "Geannuleerd"


def test_cta_reflects_whether_current_user_already_registered() -> None:
    registrations = registrations_by_event_id(
        [{"event_id": "event-a", "response": "attending"}]
    )
    assert registration_cta_label("event-a", registrations) == "Mijn aanmelding"
    assert registration_cta_label("event-b", registrations) == "Aanmelden"


def test_social_names_preview_is_compact_and_contains_only_names() -> None:
    names = ["Dennis", "Marieke", "Peter", "Sophie", "Fatima", "Alex"]
    assert attendee_names_preview(names) == (
        "Dennis · Marieke · Peter · Sophie · +2"
    )
    assert attendee_names_preview([]) == ""
    with pytest.raises(ValueError):
        attendee_names_preview(names, visible=0)
