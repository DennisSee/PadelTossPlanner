"""Centrale, frontend-onafhankelijke autorisatieregels en return-routing."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Mapping


PUBLIC_PAGE = "Openbaar schema"
MY_TOS_PAGE = "Mijn TOS"
OPEN_TOS_PAGE = "Open TOS-avonden"
MY_PROFILE_PAGE = "Mijn profiel"
PLANNER_PAGE = "Planner"
SAVED_SCHEDULES_PAGE = "Opgeslagen schema's"
USER_MANAGEMENT_PAGE = "Gebruikersbeheer"
EVENT_MANAGEMENT_PAGE = "TOS-avonden"
MEMBER_MANAGEMENT_PAGE = "Leden & niveaus"

PLANNER_ROLES = frozenset({"planner", "admin"})
ADMIN_ROLES = frozenset({"admin"})
PARTICIPANT_ROLES = frozenset({"participant"})
_EVENT_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class AuthorizationError(PermissionError):
    """De applicatierol geeft geen toegang tot de gevraagde pagina."""


@dataclass(frozen=True)
class SignupReturnContext:
    """Veilige context waarmee een signup-link na authenticatie behouden blijft."""

    event_slug: str

    @property
    def query_params(self) -> dict[str, str]:
        return {"page": "signup", "event": self.event_slug}


def _query_value(value: object) -> str:
    if isinstance(value, (list, tuple)):
        value = value[-1] if value else ""
    return str(value or "").strip()


def signup_context_from_query_params(
    query_params: Mapping[str, object],
) -> SignupReturnContext | None:
    """Accepteer uitsluitend de bekende openbare signup-route en een geldige slug."""
    if _query_value(query_params.get("page")) != "signup":
        return None

    event_slug = _query_value(query_params.get("event"))
    if not is_valid_event_slug(event_slug):
        return None
    return SignupReturnContext(event_slug=event_slug)


def is_valid_event_slug(event_slug: str) -> bool:
    return 3 <= len(event_slug) <= 80 and bool(
        _EVENT_SLUG_PATTERN.fullmatch(event_slug)
    )


def can_access_planner(role: str) -> bool:
    return role in PLANNER_ROLES


def can_access_admin(role: str) -> bool:
    return role in ADMIN_ROLES


def can_access_participant(role: str) -> bool:
    return role in PARTICIPANT_ROLES


def navigation_pages_for_role(role: str | None) -> tuple[str, ...]:
    if role and can_access_participant(role):
        return (MY_TOS_PAGE, OPEN_TOS_PAGE, MY_PROFILE_PAGE, PUBLIC_PAGE)

    pages = [PUBLIC_PAGE]
    if role and can_access_planner(role):
        pages.extend(
            (
                PLANNER_PAGE,
                EVENT_MANAGEMENT_PAGE,
                MEMBER_MANAGEMENT_PAGE,
                SAVED_SCHEDULES_PAGE,
            )
        )
    if role and can_access_admin(role):
        pages.append(USER_MANAGEMENT_PAGE)
    return tuple(pages)


def default_page_for_role(role: str | None) -> str:
    if role and can_access_participant(role):
        return MY_TOS_PAGE
    return PLANNER_PAGE if role and can_access_planner(role) else PUBLIC_PAGE


def can_access_page(role: str | None, page: str) -> bool:
    return page in navigation_pages_for_role(role)


def require_planner_role(role: str) -> None:
    if not can_access_planner(role):
        raise AuthorizationError("Alleen planners en beheerders hebben toegang.")


def require_admin_role(role: str) -> None:
    if not can_access_admin(role):
        raise AuthorizationError("Alleen beheerders hebben toegang.")


def require_participant_role(role: str) -> None:
    if not can_access_participant(role):
        raise AuthorizationError("Alleen deelnemers hebben toegang.")
