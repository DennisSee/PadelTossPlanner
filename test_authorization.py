"""Tests voor centrale rollen en veilige signup-returnrouting."""

import pytest

from authorization import (
    AuthorizationError,
    EVENT_MANAGEMENT_PAGE,
    MEMBER_MANAGEMENT_PAGE,
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
    navigation_pages_for_role,
    require_admin_role,
    require_participant_role,
    require_planner_role,
    signup_context_from_query_params,
)


def test_participant_has_no_planner_or_admin_pages() -> None:
    assert navigation_pages_for_role("participant") == (
        MY_TOS_PAGE,
        OPEN_TOS_PAGE,
        MY_PROFILE_PAGE,
        PUBLIC_PAGE,
    )
    assert default_page_for_role("participant") == MY_TOS_PAGE
    assert can_access_page("participant", MY_TOS_PAGE)
    assert can_access_page("participant", OPEN_TOS_PAGE)
    assert can_access_page("participant", MY_PROFILE_PAGE)
    assert can_access_page("participant", PUBLIC_PAGE)
    assert not can_access_page("participant", PLANNER_PAGE)
    assert not can_access_page("participant", SAVED_SCHEDULES_PAGE)
    assert not can_access_page("participant", EVENT_MANAGEMENT_PAGE)
    assert not can_access_page("participant", MEMBER_MANAGEMENT_PAGE)
    assert not can_access_page("participant", USER_MANAGEMENT_PAGE)
    with pytest.raises(AuthorizationError):
        require_planner_role("participant")
    with pytest.raises(AuthorizationError):
        require_admin_role("participant")
    require_participant_role("participant")


def test_planner_has_planner_pages_but_no_admin_page() -> None:
    assert navigation_pages_for_role("planner") == (
        PUBLIC_PAGE,
        PLANNER_PAGE,
        EVENT_MANAGEMENT_PAGE,
        MEMBER_MANAGEMENT_PAGE,
        SAVED_SCHEDULES_PAGE,
    )
    assert default_page_for_role("planner") == PLANNER_PAGE
    require_planner_role("planner")
    with pytest.raises(AuthorizationError):
        require_participant_role("planner")
    assert not can_access_page("planner", MY_PROFILE_PAGE)
    with pytest.raises(AuthorizationError):
        require_admin_role("planner")


def test_admin_has_planner_and_admin_functionality() -> None:
    assert navigation_pages_for_role("admin") == (
        PUBLIC_PAGE,
        PLANNER_PAGE,
        EVENT_MANAGEMENT_PAGE,
        MEMBER_MANAGEMENT_PAGE,
        SAVED_SCHEDULES_PAGE,
        USER_MANAGEMENT_PAGE,
    )
    require_planner_role("admin")
    require_admin_role("admin")
    with pytest.raises(AuthorizationError):
        require_participant_role("admin")
    assert not can_access_page("admin", MY_PROFILE_PAGE)


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
