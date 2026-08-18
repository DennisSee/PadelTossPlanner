"""Tests voor frontend-onafhankelijke leden- en rankingregels."""

import pytest

from member_management import (
    MemberManagementError,
    approval_transition_options,
    is_ready_for_padel_tos,
    validate_approval_transition,
    validate_ranking,
    validate_sport,
)


def _member(**overrides: object) -> dict[str, object]:
    member: dict[str, object] = {
        "active": True,
        "approval_status": "approved",
        "padel_profile": {"sport": "padel", "ranking": 3, "active": True},
        "tennis_profile": {"sport": "tennis", "ranking": 5, "active": True},
    }
    member.update(overrides)
    return member


def test_required_approval_transitions_are_available() -> None:
    assert approval_transition_options("pending") == (
        "pending",
        "approved",
        "rejected",
    )
    assert validate_approval_transition("pending", "approved") == "approved"
    assert validate_approval_transition("pending", "rejected") == "rejected"
    assert validate_approval_transition("rejected", "approved") == "approved"


def test_onboarding_only_pending_status_cannot_be_restored_by_management() -> None:
    with pytest.raises(MemberManagementError, match="approved naar pending"):
        validate_approval_transition("approved", "pending")
    with pytest.raises(MemberManagementError, match="rejected naar pending"):
        validate_approval_transition("rejected", "pending")


def test_padel_and_tennis_rankings_are_independent() -> None:
    member = _member()
    assert member["padel_profile"]["ranking"] == 3  # type: ignore[index]
    assert member["tennis_profile"]["ranking"] == 5  # type: ignore[index]
    assert is_ready_for_padel_tos(member)


@pytest.mark.parametrize(
    "overrides",
    [
        {"active": False},
        {"approval_status": "pending"},
        {"approval_status": "rejected"},
        {"padel_profile": None},
        {"padel_profile": {"sport": "padel", "ranking": None, "active": True}},
        {"padel_profile": {"sport": "padel", "ranking": 3, "active": False}},
    ],
)
def test_not_ready_for_padel_when_any_required_condition_is_missing(
    overrides: dict[str, object],
) -> None:
    assert not is_ready_for_padel_tos(_member(**overrides))


def test_account_state_does_not_replace_member_or_approval_state() -> None:
    member = _member(linked_profile={"active": False})
    assert is_ready_for_padel_tos(member)
    assert not is_ready_for_padel_tos(_member(active=False))
    assert not is_ready_for_padel_tos(_member(approval_status="pending"))


def test_ranking_can_be_explicitly_empty_but_not_outside_one_to_five() -> None:
    assert validate_ranking(None) is None
    assert validate_ranking(1) == 1
    assert validate_ranking(5) == 5
    for invalid in (0, 6, 3.5, True, "drie"):
        with pytest.raises(MemberManagementError):
            validate_ranking(invalid)


def test_only_supported_sports_are_accepted() -> None:
    assert validate_sport("Padel") == "padel"
    assert validate_sport("tennis") == "tennis"
    with pytest.raises(MemberManagementError):
        validate_sport("badminton")
