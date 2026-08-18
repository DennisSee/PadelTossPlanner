"""Frontend-onafhankelijke validatie voor TOS-eventbeheer."""

from __future__ import annotations

import re
from datetime import date, datetime, time, timezone
from typing import Any, Mapping
from urllib.parse import urlencode, urlsplit, urlunsplit
from uuid import uuid4
from zoneinfo import ZoneInfo

from authorization import is_valid_event_slug
from participant_registration import parse_supabase_timestamp


LOCAL_TIMEZONE = ZoneInfo("Europe/Amsterdam")
EVENT_SPORTS = ("padel", "tennis")
EVENT_STATUSES = ("draft", "open", "closed", "cancelled")
IMMUTABLE_EVENT_FIELDS = frozenset({"slug", "sport", "starts_at", "ends_at"})
EDITABLE_EVENT_FIELDS = frozenset({"title", "signup_deadline"})
_SLUG_TOKEN_PATTERN = re.compile(r"^[a-z0-9]{6,16}$")


class EventManagementError(ValueError):
    """Eventinvoer of publieke linkconfiguratie is ongeldig."""


def _local_datetime(event_date: date, event_time: time) -> datetime:
    candidate = datetime.combine(
        event_date,
        event_time.replace(tzinfo=None),
        tzinfo=LOCAL_TIMEZONE,
    )
    roundtrip = candidate.astimezone(timezone.utc).astimezone(LOCAL_TIMEZONE)
    if roundtrip.replace(fold=candidate.fold) != candidate:
        raise EventManagementError("Deze lokale tijd bestaat niet door de zomertijd.")
    return candidate


def validate_event_title(title: object) -> str:
    normalized = str(title or "").strip()
    if not 1 <= len(normalized) <= 160:
        raise EventManagementError("De titel moet tussen 1 en 160 tekens bevatten.")
    return normalized


def build_event_payload(
    *,
    sport: str,
    title: str,
    event_date: date,
    starts_at: time,
    ends_at: time,
    signup_deadline_enabled: bool,
    signup_deadline_date: date,
    signup_deadline_time: time,
    status: str,
) -> dict[str, Any]:
    normalized_sport = str(sport or "").strip().lower()
    if normalized_sport not in EVENT_SPORTS:
        raise EventManagementError("Kies padel of tennis als sport.")
    if status not in EVENT_STATUSES:
        raise EventManagementError("De eventstatus is ongeldig.")

    local_start = _local_datetime(event_date, starts_at)
    local_end = _local_datetime(event_date, ends_at)
    if local_end <= local_start:
        raise EventManagementError("De eindtijd moet na de starttijd liggen.")

    deadline: datetime | None = None
    if signup_deadline_enabled:
        deadline = _local_datetime(signup_deadline_date, signup_deadline_time)
        if deadline > local_start:
            raise EventManagementError(
                "De inschrijfdeadline mag niet na de starttijd liggen."
            )

    return {
        "sport": normalized_sport,
        "title": validate_event_title(title),
        "starts_at": local_start.astimezone(timezone.utc).isoformat(),
        "ends_at": local_end.astimezone(timezone.utc).isoformat(),
        "signup_deadline": (
            deadline.astimezone(timezone.utc).isoformat() if deadline else None
        ),
        "status": status,
    }


def build_event_update_payload(
    event: Mapping[str, object],
    *,
    title: str,
    signup_deadline_enabled: bool,
    signup_deadline_date: date,
    signup_deadline_time: time,
) -> dict[str, Any]:
    event_start = parse_supabase_timestamp(
        event.get("starts_at"),
        field_name="starttijd",
    )
    deadline: datetime | None = None
    if signup_deadline_enabled:
        deadline = _local_datetime(signup_deadline_date, signup_deadline_time)
        if deadline.astimezone(timezone.utc) > event_start:
            raise EventManagementError(
                "De inschrijfdeadline mag niet na de starttijd liggen."
            )
    return {
        "title": validate_event_title(title),
        "signup_deadline": (
            deadline.astimezone(timezone.utc).isoformat() if deadline else None
        ),
    }


def generate_event_slug(
    sport: str,
    event_date: date,
    *,
    unique_token: str | None = None,
) -> str:
    normalized_sport = str(sport or "").strip().lower()
    if normalized_sport not in EVENT_SPORTS:
        raise EventManagementError("Een geldige sport is nodig voor de eventslug.")
    token = str(unique_token or uuid4().hex[:8]).strip().lower()
    if not _SLUG_TOKEN_PATTERN.fullmatch(token):
        raise EventManagementError("De unieke eventslugcode is ongeldig.")
    slug = f"{normalized_sport}-tos-{event_date:%Y%m%d}-{token}"
    if not is_valid_event_slug(slug):
        raise EventManagementError("De gegenereerde eventslug is ongeldig.")
    return slug


def public_base_url_from_secrets(secrets: Mapping[str, object]) -> str:
    try:
        section = secrets["app"]
        value = section.get("public_base_url")  # type: ignore[union-attr]
    except (AttributeError, KeyError, TypeError) as exc:
        raise EventManagementError(
            "Voeg app.public_base_url toe voor deelbare aanmeldlinks."
        ) from exc

    parsed = urlsplit(str(value or "").strip())
    is_loopback = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if (
        not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or (parsed.scheme != "https" and not (parsed.scheme == "http" and is_loopback))
    ):
        raise EventManagementError(
            "app.public_base_url moet HTTPS gebruiken; lokaal is HTTP op localhost toegestaan."
        )
    path = (parsed.path or "/").rstrip("/") + "/"
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def build_signup_url(public_base_url: str, event_slug: str) -> str:
    if not is_valid_event_slug(event_slug):
        raise EventManagementError("De eventslug is ongeldig.")
    base_url = public_base_url_from_secrets(
        {"app": {"public_base_url": public_base_url}}
    )
    query = urlencode({"page": "signup", "event": event_slug})
    return f"{base_url}?{query}"


def immutable_event_fields_changed(
    existing: Mapping[str, object],
    proposed: Mapping[str, object],
) -> bool:
    return any(
        field in proposed and proposed[field] != existing.get(field)
        for field in IMMUTABLE_EVENT_FIELDS
    )
