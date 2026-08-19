"""Tests voor centrale rollen en veilige signup-returnrouting."""

import pytest

from authorization import (
    AuthorizationError,
    LEGACY_EVENT_MANAGEMENT_PAGE,
    LEGACY_MEMBER_MANAGEMENT_PAGE,
    LEGACY_MY_TOS_PAGE,
    LEGACY_OPEN_TOS_PAGE,
    LEGACY_PLANNER_PAGE,
    LEGACY_PUBLIC_PAGE,
    LEGACY_SAVED_SCHEDULES_PAGE,
    LEGACY_USER_MANAGEMENT_PAGE,
    LIVE_TOS_PAGE,
    MEMBER_MANAGEMENT_ACCOUNTS,
    MEMBER_MANAGEMENT_MEMBERS,
    MEMBER_MANAGEMENT_PAGE,
    MembershipCapability,
    MembershipStatus,
    MY_PROFILE_PAGE,
    ParticipantReturnContext,
    TOS_MANAGEMENT_EVENTS,
    TOS_MANAGEMENT_PAGE,
    TOS_MANAGEMENT_PLANNER,
    TOS_MANAGEMENT_SAVED,
    TOS_PAGE,
    can_access_page,
    default_page_for_role,
    navigation_pages_for_capabilities,
    normalize_navigation_target,
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
        LIVE_TOS_PAGE,
        TOS_PAGE,
        MY_PROFILE_PAGE,
    )
    assert default_page_for_role("participant") == TOS_PAGE
    assert can_access_page("participant", TOS_PAGE, participant_area=True)
    assert can_access_page(
        "participant", MY_PROFILE_PAGE, participant_area=True
    )
    assert can_access_page("participant", LIVE_TOS_PAGE, participant_area=True)
    assert not can_access_page(
        "participant", TOS_MANAGEMENT_PAGE, participant_area=True
    )
    assert not can_access_page(
        "participant", MEMBER_MANAGEMENT_PAGE, participant_area=True
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
        LIVE_TOS_PAGE,
        TOS_PAGE,
        MY_PROFILE_PAGE,
        TOS_MANAGEMENT_PAGE,
        MEMBER_MANAGEMENT_PAGE,
    )
    assert default_page_for_role("planner") == TOS_MANAGEMENT_PAGE
    require_planner_role("planner")
    require_participant_access(
        MembershipCapability(MembershipStatus.READY, "member-planner")
    )
    assert can_access_page("planner", MY_PROFILE_PAGE, participant_area=True)
    assert not can_access_page(
        "planner", "Gebruikersbeheer", participant_area=True
    )
    with pytest.raises(AuthorizationError):
        require_admin_role("planner")


def test_admin_member_combines_participant_planner_and_admin_pages() -> None:
    assert navigation_pages_for_capabilities("admin", participant_area=True) == (
        LIVE_TOS_PAGE,
        TOS_PAGE,
        MY_PROFILE_PAGE,
        TOS_MANAGEMENT_PAGE,
        MEMBER_MANAGEMENT_PAGE,
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
        assert TOS_PAGE in pages
        assert TOS_MANAGEMENT_PAGE in pages
        require_participant_access(
            MembershipCapability(MembershipStatus.NEEDS_ONBOARDING),
            allow_onboarding=True,
        )
        with pytest.raises(AuthorizationError):
            require_participant_access(
                MembershipCapability(MembershipStatus.NEEDS_ONBOARDING)
            )


def test_legacy_navigation_is_translated_centrally_to_compact_tasks() -> None:
    cases = (
        (LEGACY_PUBLIC_PAGE, "participant", LIVE_TOS_PAGE, None),
        (LEGACY_MY_TOS_PAGE, "participant", TOS_PAGE, None),
        (LEGACY_OPEN_TOS_PAGE, "participant", TOS_PAGE, None),
        (
            LEGACY_PLANNER_PAGE,
            "planner",
            TOS_MANAGEMENT_PAGE,
            TOS_MANAGEMENT_PLANNER,
        ),
        (
            LEGACY_SAVED_SCHEDULES_PAGE,
            "planner",
            TOS_MANAGEMENT_PAGE,
            TOS_MANAGEMENT_SAVED,
        ),
        (
            LEGACY_MEMBER_MANAGEMENT_PAGE,
            "planner",
            MEMBER_MANAGEMENT_PAGE,
            MEMBER_MANAGEMENT_MEMBERS,
        ),
        (
            LEGACY_USER_MANAGEMENT_PAGE,
            "admin",
            MEMBER_MANAGEMENT_PAGE,
            MEMBER_MANAGEMENT_ACCOUNTS,
        ),
    )
    for old_page, role, expected_page, expected_section in cases:
        target = normalize_navigation_target(
            old_page,
            role,
            participant_area=True,
            legacy_session=True,
        )
        assert (target.page, target.section) == (
            expected_page,
            expected_section,
        )


def test_ambiguous_old_tos_page_is_only_staff_legacy_event_management_once() -> None:
    old_staff = normalize_navigation_target(
        LEGACY_EVENT_MANAGEMENT_PAGE,
        "planner",
        participant_area=True,
        legacy_session=True,
    )
    current_staff = normalize_navigation_target(
        TOS_PAGE,
        "planner",
        participant_area=True,
        legacy_session=False,
    )
    assert (old_staff.page, old_staff.section) == (
        TOS_MANAGEMENT_PAGE,
        TOS_MANAGEMENT_EVENTS,
    )
    assert (current_staff.page, current_staff.section) == (TOS_PAGE, None)


def test_legacy_or_manipulated_admin_state_remains_fail_closed() -> None:
    planner_target = normalize_navigation_target(
        LEGACY_USER_MANAGEMENT_PAGE,
        "planner",
        participant_area=True,
        legacy_session=True,
    )
    participant_target = normalize_navigation_target(
        LEGACY_USER_MANAGEMENT_PAGE,
        "participant",
        participant_area=True,
        legacy_session=True,
    )
    unknown_target = normalize_navigation_target(
        "Onbekende interne route",
        "participant",
        participant_area=True,
    )
    assert (planner_target.page, planner_target.section) == (
        MEMBER_MANAGEMENT_PAGE,
        MEMBER_MANAGEMENT_MEMBERS,
    )
    assert participant_target.page == TOS_PAGE
    assert unknown_target.page == TOS_PAGE


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
