"""Frontend-onafhankelijke helpers voor participantregistraties."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timezone
from typing import Mapping
from zoneinfo import ZoneInfo


LOCAL_TIMEZONE = ZoneInfo("Europe/Amsterdam")
REGISTRATION_ATTENDING = "attending"
REGISTRATION_DECLINED = "declined"
REGISTRATION_RESPONSES = (REGISTRATION_ATTENDING, REGISTRATION_DECLINED)
_SPORT_LABELS = {"padel": "Padel", "tennis": "Tennis"}
_DUTCH_WEEKDAYS = (
    "maandag",
    "dinsdag",
    "woensdag",
    "donderdag",
    "vrijdag",
    "zaterdag",
    "zondag",
)
_DUTCH_MONTHS = (
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "augustus",
    "september",
    "oktober",
    "november",
    "december",
)


class ParticipantRegistrationError(ValueError):
    """Event- of registratie-invoer is ongeldig voor de self-serviceflow."""


@dataclass(frozen=True)
class EventWindow:
    starts_at: datetime
    ends_at: datetime
    signup_deadline: datetime | None
    status: str

    @property
    def local_start(self) -> datetime:
        return self.starts_at.astimezone(LOCAL_TIMEZONE)

    @property
    def local_end(self) -> datetime:
        return self.ends_at.astimezone(LOCAL_TIMEZONE)


def parse_supabase_timestamp(value: object, *, field_name: str) -> datetime:
    raw_value = str(value or "").strip()
    try:
        parsed = datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
    except ValueError:
        raise ParticipantRegistrationError(
            f"Het event bevat een ongeldige {field_name}."
        ) from None
    if parsed.tzinfo is None:
        raise ParticipantRegistrationError(
            f"Het event bevat een {field_name} zonder tijdzone."
        )
    return parsed.astimezone(timezone.utc)


def event_window(event: Mapping[str, object]) -> EventWindow:
    starts_at = parse_supabase_timestamp(
        event.get("starts_at"),
        field_name="starttijd",
    )
    ends_at = parse_supabase_timestamp(
        event.get("ends_at"),
        field_name="eindtijd",
    )
    if ends_at <= starts_at:
        raise ParticipantRegistrationError("De eventtijden zijn ongeldig.")

    raw_deadline = event.get("signup_deadline")
    signup_deadline = (
        parse_supabase_timestamp(raw_deadline, field_name="aanmelddeadline")
        if raw_deadline
        else None
    )
    return EventWindow(
        starts_at=starts_at,
        ends_at=ends_at,
        signup_deadline=signup_deadline,
        status=str(event.get("status") or ""),
    )


def event_allows_self_service(
    event: Mapping[str, object],
    *,
    now: datetime | None = None,
) -> bool:
    window = event_window(event)
    current_time = now or datetime.now(timezone.utc)
    if current_time.tzinfo is None:
        raise ParticipantRegistrationError("De controletijd mist een tijdzone.")
    return window.status == "open" and (
        window.signup_deadline is None
        or current_time.astimezone(timezone.utc) <= window.signup_deadline
    )


def registration_initial_values(
    event: Mapping[str, object],
    registration: Mapping[str, object] | None,
) -> tuple[str, time, time]:
    window = event_window(event)
    response = str((registration or {}).get("response") or REGISTRATION_ATTENDING)
    if response not in REGISTRATION_RESPONSES:
        response = REGISTRATION_ATTENDING

    available_from = (registration or {}).get("available_from")
    available_until = (registration or {}).get("available_until")
    from_datetime = (
        parse_supabase_timestamp(available_from, field_name="beschikbaarheid vanaf")
        if available_from
        else window.starts_at
    )
    until_datetime = (
        parse_supabase_timestamp(available_until, field_name="beschikbaarheid tot")
        if available_until
        else window.ends_at
    )
    return (
        response,
        from_datetime.astimezone(LOCAL_TIMEZONE).timetz().replace(tzinfo=None),
        until_datetime.astimezone(LOCAL_TIMEZONE).timetz().replace(tzinfo=None),
    )


def registration_availability(
    event: Mapping[str, object],
    response: str,
    available_from: time | None,
    available_until: time | None,
) -> tuple[datetime | None, datetime | None]:
    if response not in REGISTRATION_RESPONSES:
        raise ParticipantRegistrationError("Kies of je wel of niet meedoet.")
    if response == REGISTRATION_DECLINED:
        return None, None
    if available_from is None or available_until is None:
        raise ParticipantRegistrationError("Vul je volledige beschikbaarheid in.")

    window = event_window(event)
    local_from = datetime.combine(
        window.local_start.date(),
        available_from.replace(tzinfo=None),
        tzinfo=LOCAL_TIMEZONE,
    )
    local_until = datetime.combine(
        window.local_end.date(),
        available_until.replace(tzinfo=None),
        tzinfo=LOCAL_TIMEZONE,
    )
    normalized_from = local_from.astimezone(timezone.utc)
    normalized_until = local_until.astimezone(timezone.utc)
    if (
        normalized_from < window.starts_at
        or normalized_until > window.ends_at
        or normalized_until <= normalized_from
    ):
        raise ParticipantRegistrationError(
            "Beschikbaarheid moet binnen de volledige TOS-tijd vallen."
        )
    return normalized_from, normalized_until


def event_sport_label(event: Mapping[str, object]) -> str:
    return _SPORT_LABELS.get(str(event.get("sport") or "").lower(), "TOS")


def format_event_date(event: Mapping[str, object]) -> str:
    local_start = event_window(event).local_start
    return (
        f"{_DUTCH_WEEKDAYS[local_start.weekday()]} {local_start.day} "
        f"{_DUTCH_MONTHS[local_start.month - 1]} {local_start.year}"
    )
