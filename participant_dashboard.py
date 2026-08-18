"""Pure presentatielogica voor het participantdashboard en eventlijsten."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any


EVENT_STATUS_LABELS = {
    "draft": "Concept",
    "open": "Open voor inschrijving",
    "closed": "Inschrijving gesloten",
    "cancelled": "Geannuleerd",
}


def registration_event(registration: Mapping[str, Any]) -> dict[str, Any]:
    """Normaliseer de PostgREST-relatie naar precies één eventobject."""
    event = registration.get("tos_events")
    if isinstance(event, list):
        event = event[0] if event else None
    return dict(event) if isinstance(event, Mapping) else {}


def registrations_by_event_id(
    registrations: Iterable[Mapping[str, Any]],
) -> dict[str, Mapping[str, Any]]:
    return {
        str(registration.get("event_id")): registration
        for registration in registrations
        if registration.get("event_id")
    }


def registration_response_label(response: object) -> str:
    return "Ik doe mee" if response == "attending" else "Ik doe niet mee"


def event_status_label(status: object) -> str:
    normalized = str(status or "").strip()
    return EVENT_STATUS_LABELS.get(normalized, "Status onbekend")


def registration_cta_label(
    event_id: object,
    registrations: Mapping[str, Mapping[str, Any]],
) -> str:
    return (
        "Mijn aanmelding"
        if str(event_id or "") in registrations
        else "Aanmelden"
    )


def attendee_names_preview(
    names: Iterable[object],
    *,
    visible: int = 4,
) -> str:
    """Maak een compacte mobiele namenpreview zonder andere deelnemersvelden."""
    if visible < 1:
        raise ValueError("Er moet minimaal één naam zichtbaar kunnen zijn.")
    normalized = [str(name).strip() for name in names if str(name).strip()]
    shown = normalized[:visible]
    remaining = len(normalized) - len(shown)
    preview = " · ".join(shown)
    if remaining:
        preview = f"{preview} · +{remaining}"
    return preview
