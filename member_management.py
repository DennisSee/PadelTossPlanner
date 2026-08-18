"""Frontend-onafhankelijke validatie voor leden-, approval- en rankingbeheer."""

from __future__ import annotations

from typing import Mapping


APPROVAL_STATUSES = ("pending", "approved", "rejected")
MEMBER_SPORTS = ("padel", "tennis")
RANKING_VALUES = (1, 2, 3, 4, 5)

_APPROVAL_TRANSITIONS = {
    "pending": frozenset({"approved", "rejected"}),
    "approved": frozenset({"rejected"}),
    "rejected": frozenset({"approved"}),
}


class MemberManagementError(ValueError):
    """Een beheerwijziging voor een clublid is ongeldig."""


def validate_approval_transition(current: object, target: object) -> str:
    """Sta alleen expliciete V1-overgangen toe; onboarding bepaalt ``pending``."""
    current_status = str(current or "").strip().lower()
    target_status = str(target or "").strip().lower()
    if current_status not in APPROVAL_STATUSES or target_status not in APPROVAL_STATUSES:
        raise MemberManagementError("De approval-status is ongeldig.")
    if current_status == target_status:
        return target_status
    if target_status not in _APPROVAL_TRANSITIONS[current_status]:
        raise MemberManagementError(
            f"Approval kan niet van {current_status} naar {target_status} worden gezet."
        )
    return target_status


def approval_transition_options(current: object) -> tuple[str, ...]:
    current_status = str(current or "").strip().lower()
    if current_status not in APPROVAL_STATUSES:
        raise MemberManagementError("De approval-status is ongeldig.")
    return (current_status, *sorted(_APPROVAL_TRANSITIONS[current_status]))


def validate_sport(sport: object) -> str:
    normalized = str(sport or "").strip().lower()
    if normalized not in MEMBER_SPORTS:
        raise MemberManagementError("Kies padel of tennis als sport.")
    return normalized


def validate_ranking(ranking: object | None) -> int | None:
    """Normaliseer ranking 1–5; ``None`` is een bewuste ontbrekende ranking."""
    if ranking is None:
        return None
    if isinstance(ranking, bool):
        raise MemberManagementError("Ranking moet een geheel getal tussen 1 en 5 zijn.")
    try:
        normalized = int(ranking)
    except (TypeError, ValueError):
        raise MemberManagementError(
            "Ranking moet een geheel getal tussen 1 en 5 zijn."
        ) from None
    if normalized not in RANKING_VALUES or str(ranking).strip() not in {
        str(value) for value in RANKING_VALUES
    }:
        raise MemberManagementError("Ranking moet een geheel getal tussen 1 en 5 zijn.")
    return normalized


def is_ready_for_padel_tos(member: Mapping[str, object]) -> bool:
    """Leid planner-readiness af zonder een extra, verouderingsgevoelige DB-kolom."""
    padel_profile = member.get("padel_profile")
    if not isinstance(padel_profile, Mapping):
        return False
    try:
        ranking = validate_ranking(padel_profile.get("ranking"))
    except MemberManagementError:
        return False
    return bool(
        member.get("active")
        and member.get("approval_status") == "approved"
        and padel_profile.get("active")
        and ranking is not None
    )
