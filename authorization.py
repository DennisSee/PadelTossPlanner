"""Centrale, frontend-onafhankelijke autorisatieregels en return-routing."""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Literal, Mapping


LIVE_TOS_PAGE = "Live TOS-schema"
TOS_PAGE = "TOS-avonden"
MY_PROFILE_PAGE = "Mijn profiel"
TOS_MANAGEMENT_PAGE = "TOS-beheer"
MEMBER_MANAGEMENT_PAGE = "Ledenbeheer"

# Semantische aliases houden bestaande imports klein, terwijl het hoofdmenu nog
# maar vijf taken kent. De oude zichtbare labels worden uitsluitend hieronder
# door ``normalize_navigation_target`` afgehandeld.
PUBLIC_PAGE = LIVE_TOS_PAGE
MY_TOS_PAGE = TOS_PAGE
OPEN_TOS_PAGE = TOS_PAGE
PLANNER_PAGE = TOS_MANAGEMENT_PAGE
EVENT_MANAGEMENT_PAGE = TOS_MANAGEMENT_PAGE
SAVED_SCHEDULES_PAGE = TOS_MANAGEMENT_PAGE
USER_MANAGEMENT_PAGE = MEMBER_MANAGEMENT_PAGE

TOS_MANAGEMENT_EVENTS = "Avonden"
TOS_MANAGEMENT_PLANNER = "Schema maken"
TOS_MANAGEMENT_SAVED = "Opgeslagen schema's"
MEMBER_MANAGEMENT_MEMBERS = "Leden & niveaus"
MEMBER_MANAGEMENT_ACCOUNTS = "Accounts"

LEGACY_PUBLIC_PAGE = "Openbaar schema"
LEGACY_MY_TOS_PAGE = "Mijn TOS"
LEGACY_OPEN_TOS_PAGE = "Open TOS-avonden"
LEGACY_PLANNER_PAGE = "Planner"
LEGACY_EVENT_MANAGEMENT_PAGE = "TOS-avonden"
LEGACY_MEMBER_MANAGEMENT_PAGE = "Leden & niveaus"
LEGACY_SAVED_SCHEDULES_PAGE = "Opgeslagen schema's"
LEGACY_USER_MANAGEMENT_PAGE = "Gebruikersbeheer"

PLANNER_ROLES = frozenset({"planner", "admin"})
ADMIN_ROLES = frozenset({"admin"})
_EVENT_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class AuthorizationError(PermissionError):
    """De applicatierol geeft geen toegang tot de gevraagde pagina."""


class MembershipStatus(str, Enum):
    """Frontend- en database-onafhankelijke toestand van de eigen ledenkoppeling."""

    NEEDS_ONBOARDING = "needs_onboarding"
    PENDING_APPROVAL = "pending_approval"
    REJECTED = "rejected"
    MEMBER_INACTIVE = "inactive"
    ACCOUNT_INACTIVE = "account_inactive"
    UNAVAILABLE = "member_unavailable"
    READY = "ready"


@dataclass(frozen=True)
class MembershipCapability:
    """Alleen membership bepaalt deelname; ``role`` hoort hier bewust niet in."""

    status: MembershipStatus
    member_id: str | None = None

    @property
    def can_participate(self) -> bool:
        return self.status is MembershipStatus.READY

    @property
    def can_onboard(self) -> bool:
        return self.status is MembershipStatus.NEEDS_ONBOARDING

    @property
    def can_open_participant_area(self) -> bool:
        return self.status not in {
            MembershipStatus.ACCOUNT_INACTIVE,
            MembershipStatus.UNAVAILABLE,
        }


@dataclass(frozen=True)
class NavigationTarget:
    """Een hoofdroute met hoogstens één veilige interne beheerbestemming."""

    page: str
    section: str | None = None


@dataclass(frozen=True)
class ParticipantReturnContext:
    """Gevalideerde interne bestemming na participant-authenticatie."""

    destination: Literal["home", "signup"]
    event_slug: str | None = None

    def __post_init__(self) -> None:
        valid_home = self.destination == "home" and self.event_slug is None
        valid_signup = (
            self.destination == "signup"
            and self.event_slug is not None
            and is_valid_event_slug(self.event_slug)
        )
        if not (valid_home or valid_signup):
            raise ValueError("De participant-returnroute is ongeldig.")

    @classmethod
    def home(cls) -> "ParticipantReturnContext":
        return cls(destination="home")

    @classmethod
    def signup(cls, event_slug: str) -> "ParticipantReturnContext":
        return cls(destination="signup", event_slug=event_slug)

    @property
    def is_signup(self) -> bool:
        return self.destination == "signup"

    @property
    def query_params(self) -> dict[str, str]:
        if not self.is_signup:
            return {}
        assert self.event_slug is not None
        return {"page": "signup", "event": self.event_slug}


def _query_value(value: object) -> str:
    if isinstance(value, (list, tuple)):
        value = value[-1] if value else ""
    return str(value or "").strip()


def signup_context_from_query_params(
    query_params: Mapping[str, object],
) -> ParticipantReturnContext | None:
    """Accepteer uitsluitend de bekende openbare signup-route en een geldige slug."""
    if _query_value(query_params.get("page")) != "signup":
        return None

    event_slug = _query_value(query_params.get("event"))
    if not is_valid_event_slug(event_slug):
        return None
    return ParticipantReturnContext.signup(event_slug)


def is_valid_event_slug(event_slug: str) -> bool:
    return 3 <= len(event_slug) <= 80 and bool(
        _EVENT_SLUG_PATTERN.fullmatch(event_slug)
    )


def can_access_planner(role: str) -> bool:
    return role in PLANNER_ROLES


def can_access_admin(role: str) -> bool:
    return role in ADMIN_ROLES


def navigation_pages_for_capabilities(
    role: str | None,
    *,
    participant_area: bool,
) -> tuple[str, ...]:
    """Combineer membershippagina's en staffpagina's zonder rechten te mengen."""
    pages = (
        [LIVE_TOS_PAGE, TOS_PAGE, MY_PROFILE_PAGE]
        if participant_area
        else [LIVE_TOS_PAGE]
    )
    if role and can_access_planner(role):
        pages.extend((TOS_MANAGEMENT_PAGE, MEMBER_MANAGEMENT_PAGE))
    return tuple(pages)


def default_page_for_role(role: str | None) -> str:
    if role == "participant":
        return TOS_PAGE
    return (
        TOS_MANAGEMENT_PAGE
        if role and can_access_planner(role)
        else LIVE_TOS_PAGE
    )


def normalize_navigation_target(
    page: object,
    role: str | None,
    *,
    participant_area: bool,
    legacy_session: bool = False,
) -> NavigationTarget:
    """Vertaal oude session-state centraal en laat onbekende routes fail-closed.

    ``TOS-avonden`` is bewust alleen tijdens een eenmalige legacy-migratie
    ambigu: voor staff was dit vroeger eventbeheer, terwijl het nu de
    participanttaak is. Nieuwe navigatie schrijft altijd de actuele stateversie.
    """
    requested = str(page or "").strip()
    target = NavigationTarget(requested)

    legacy_targets = {
        LEGACY_PUBLIC_PAGE: NavigationTarget(LIVE_TOS_PAGE),
        LEGACY_MY_TOS_PAGE: NavigationTarget(TOS_PAGE),
        LEGACY_OPEN_TOS_PAGE: NavigationTarget(TOS_PAGE),
        LEGACY_PLANNER_PAGE: NavigationTarget(
            TOS_MANAGEMENT_PAGE,
            TOS_MANAGEMENT_PLANNER,
        ),
        LEGACY_MEMBER_MANAGEMENT_PAGE: NavigationTarget(
            MEMBER_MANAGEMENT_PAGE,
            MEMBER_MANAGEMENT_MEMBERS,
        ),
        LEGACY_SAVED_SCHEDULES_PAGE: NavigationTarget(
            TOS_MANAGEMENT_PAGE,
            TOS_MANAGEMENT_SAVED,
        ),
        LEGACY_USER_MANAGEMENT_PAGE: NavigationTarget(
            MEMBER_MANAGEMENT_PAGE,
            MEMBER_MANAGEMENT_ACCOUNTS,
        ),
    }
    if requested in legacy_targets:
        target = legacy_targets[requested]
    if (
        legacy_session
        and requested == LEGACY_EVENT_MANAGEMENT_PAGE
        and role
        and can_access_planner(role)
    ):
        target = NavigationTarget(
            TOS_MANAGEMENT_PAGE,
            TOS_MANAGEMENT_EVENTS,
        )

    if not can_access_page(
        role,
        target.page,
        participant_area=participant_area,
    ):
        target = NavigationTarget(default_page_for_role(role))

    if target.page == TOS_MANAGEMENT_PAGE:
        section = target.section or TOS_MANAGEMENT_PLANNER
        if section not in {
            TOS_MANAGEMENT_EVENTS,
            TOS_MANAGEMENT_PLANNER,
            TOS_MANAGEMENT_SAVED,
        }:
            section = TOS_MANAGEMENT_PLANNER
        return NavigationTarget(target.page, section)

    if target.page == MEMBER_MANAGEMENT_PAGE:
        section = target.section or MEMBER_MANAGEMENT_MEMBERS
        if section == MEMBER_MANAGEMENT_ACCOUNTS and not (
            role and can_access_admin(role)
        ):
            section = MEMBER_MANAGEMENT_MEMBERS
        if section not in {
            MEMBER_MANAGEMENT_MEMBERS,
            MEMBER_MANAGEMENT_ACCOUNTS,
        }:
            section = MEMBER_MANAGEMENT_MEMBERS
        return NavigationTarget(target.page, section)

    return NavigationTarget(target.page)


def can_access_page(
    role: str | None,
    page: str,
    *,
    participant_area: bool,
) -> bool:
    return page in navigation_pages_for_capabilities(
        role,
        participant_area=participant_area,
    )


def require_planner_role(role: str) -> None:
    if not can_access_planner(role):
        raise AuthorizationError("Alleen planners en beheerders hebben toegang.")


def require_admin_role(role: str) -> None:
    if not can_access_admin(role):
        raise AuthorizationError("Alleen beheerders hebben toegang.")


def require_participant_access(
    capability: MembershipCapability,
    *,
    allow_onboarding: bool = False,
) -> None:
    """Beveilig participantpagina's op membership, nooit op staffrol."""
    if capability.can_participate:
        return
    if allow_onboarding and capability.can_open_participant_area:
        return
    raise AuthorizationError("Je ledenkoppeling geeft geen toegang tot deze functie.")
