"""Tests voor centrale rollen en veilige signup-returnrouting."""

import pytest

from authorization import (
    AuthorizationError,
    EVENT_MANAGEMENT_PAGE,
    MEMBER_MANAGEMENT_PAGE,
    MembershipCapability,
    MembershipStatus,
    MY_PROFILE_PAGE,
    MY_TOS_PAGE,
    OPEN_TOS_PAGE,
    ParticipantReturnContext,
    PLANNER_PAGE,
    PUBLIC_PAGE,
    SAVED_SCHEDULES_PAGE,
    USER_MANAGEMENT_PAGE,
    can_access_page,
    default_page_for_role,
    navigation_pages_for_capabilities,
    require_admin_role,
    require_participant_access,
    require_planner_role,
    signup_context_from_query_params,
)


def test_participant_has_no_planner_or_admin_pages() -> None:
    assert navigation_pages_for_capabilities(
        "participant",
        participant_area=True,
    ) == (
        MY_TOS_PAGE,
        OPEN_TOS_PAGE,
        MY_PROFILE_PAGE,
        PUBLIC_PAGE,
    )
    assert default_page_for_role("participant") == MY_TOS_PAGE
    assert can_access_page(
        "participant", MY_TOS_PAGE, participant_area=True
    )
    assert can_access_page(
        "participant", OPEN_TOS_PAGE, participant_area=True
    )
    assert can_access_page(
        "participant", MY_PROFILE_PAGE, participant_area=True
    )
    assert can_access_page("participant", PUBLIC_PAGE, participant_area=True)
    assert not can_access_page("participant", PLANNER_PAGE, participant_area=True)
    assert not can_access_page(
        "participant", SAVED_SCHEDULES_PAGE, participant_area=True
    )
    assert not can_access_page(
        "participant", EVENT_MANAGEMENT_PAGE, participant_area=True
    )
    assert not can_access_page(
        "participant", MEMBER_MANAGEMENT_PAGE, participant_area=True
    )
    assert not can_access_page(
        "participant", USER_MANAGEMENT_PAGE, participant_area=True
    )
    with pytest.raises(AuthorizationError):
        require_planner_role("participant")
    with pytest.raises(AuthorizationError):
        require_admin_role("participant")
    require_participant_access(
        MembershipCapability(MembershipStatus.READY, "member-a")
    )


def test_planner_member_combines_participant_and_planner_pages() -> None:
    assert navigation_pages_for_capabilities("planner", participant_area=True) == (
        MY_TOS_PAGE,
        OPEN_TOS_PAGE,
        MY_PROFILE_PAGE,
        PUBLIC_PAGE,
        PLANNER_PAGE,
        EVENT_MANAGEMENT_PAGE,
        MEMBER_MANAGEMENT_PAGE,
        SAVED_SCHEDULES_PAGE,
    )
    assert default_page_for_role("planner") == PLANNER_PAGE
    require_planner_role("planner")
    require_participant_access(
        MembershipCapability(MembershipStatus.READY, "member-planner")
    )
    assert can_access_page("planner", MY_PROFILE_PAGE, participant_area=True)
    assert not can_access_page("planner", USER_MANAGEMENT_PAGE, participant_area=True)
    with pytest.raises(AuthorizationError):
        require_admin_role("planner")


def test_admin_member_combines_participant_planner_and_admin_pages() -> None:
    assert navigation_pages_for_capabilities("admin", participant_area=True) == (
        MY_TOS_PAGE,
        OPEN_TOS_PAGE,
        MY_PROFILE_PAGE,
        PUBLIC_PAGE,
        PLANNER_PAGE,
        EVENT_MANAGEMENT_PAGE,
        MEMBER_MANAGEMENT_PAGE,
        SAVED_SCHEDULES_PAGE,
        USER_MANAGEMENT_PAGE,
    )
    require_planner_role("admin")
    require_admin_role("admin")
    require_participant_access(
        MembershipCapability(MembershipStatus.READY, "member-admin")
    )
    assert can_access_page("admin", MY_PROFILE_PAGE, participant_area=True)


def test_staff_without_membership_keeps_staff_pages_and_can_open_onboarding() -> None:
    for role in ("planner", "admin"):
        pages = navigation_pages_for_capabilities(role, participant_area=True)
        assert MY_TOS_PAGE in pages
        assert PLANNER_PAGE in pages
        require_participant_access(
            MembershipCapability(MembershipStatus.NEEDS_ONBOARDING),
            allow_onboarding=True,
        )
        with pytest.raises(AuthorizationError):
            require_participant_access(
                MembershipCapability(MembershipStatus.NEEDS_ONBOARDING)
            )


@pytest.mark.parametrize(
    "status",
    [
        MembershipStatus.PENDING_APPROVAL,
        MembershipStatus.REJECTED,
        MembershipStatus.MEMBER_INACTIVE,
        MembershipStatus.ACCOUNT_INACTIVE,
        MembershipStatus.UNAVAILABLE,
    ],
)
def test_non_ready_membership_never_grants_registration_access(
    status: MembershipStatus,
) -> None:
    with pytest.raises(AuthorizationError):
        require_participant_access(MembershipCapability(status, "member-a"))


def test_signup_return_context_accepts_only_known_safe_route() -> None:
    context = signup_context_from_query_params(
        {"page": "signup", "event": "vrijdag-tos"}
    )
    assert context is not None
    assert context.event_slug == "vrijdag-tos"
    assert context.query_params == {"page": "signup", "event": "vrijdag-tos"}

    assert signup_context_from_query_params(
        {"page": "signup", "event": "../../onveilig"}
    ) is None
    assert signup_context_from_query_params(
        {"page": "planner", "event": "vrijdag-tos"}
    ) is None


def test_participant_return_context_has_explicit_safe_home_and_signup_routes() -> None:
    home = ParticipantReturnContext.home()
    signup = ParticipantReturnContext.signup("vrijdag-tos")

    assert home.destination == "home"
    assert home.event_slug is None
    assert home.query_params == {}
    assert not home.is_signup
    assert signup.destination == "signup"
    assert signup.event_slug == "vrijdag-tos"
    assert signup.query_params == {"page": "signup", "event": "vrijdag-tos"}
    assert signup.is_signup

    with pytest.raises(ValueError):
        ParticipantReturnContext(destination="home", event_slug="vrijdag-tos")
    with pytest.raises(ValueError):
        ParticipantReturnContext(destination="signup", event_slug="../../planner")
