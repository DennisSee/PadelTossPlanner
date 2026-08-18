"""Tests voor centrale rollen en veilige signup-returnrouting."""

import pytest

from authorization import (
    AuthorizationError,
    EVENT_MANAGEMENT_PAGE,
    PLANNER_PAGE,
    PUBLIC_PAGE,
    SAVED_SCHEDULES_PAGE,
    USER_MANAGEMENT_PAGE,
    can_access_page,
    default_page_for_role,
    navigation_pages_for_role,
    require_admin_role,
    require_planner_role,
    signup_context_from_query_params,
)


def test_participant_has_no_planner_or_admin_pages() -> None:
    assert navigation_pages_for_role("participant") == (PUBLIC_PAGE,)
    assert default_page_for_role("participant") == PUBLIC_PAGE
    assert not can_access_page("participant", PLANNER_PAGE)
    assert not can_access_page("participant", SAVED_SCHEDULES_PAGE)
    assert not can_access_page("participant", EVENT_MANAGEMENT_PAGE)
    assert not can_access_page("participant", USER_MANAGEMENT_PAGE)
    with pytest.raises(AuthorizationError):
        require_planner_role("participant")
    with pytest.raises(AuthorizationError):
        require_admin_role("participant")


def test_planner_has_planner_pages_but_no_admin_page() -> None:
    assert navigation_pages_for_role("planner") == (
        PUBLIC_PAGE,
        PLANNER_PAGE,
        EVENT_MANAGEMENT_PAGE,
        SAVED_SCHEDULES_PAGE,
    )
    assert default_page_for_role("planner") == PLANNER_PAGE
    require_planner_role("planner")
    with pytest.raises(AuthorizationError):
        require_admin_role("planner")


def test_admin_has_planner_and_admin_functionality() -> None:
    assert navigation_pages_for_role("admin") == (
        PUBLIC_PAGE,
        PLANNER_PAGE,
        EVENT_MANAGEMENT_PAGE,
        SAVED_SCHEDULES_PAGE,
        USER_MANAGEMENT_PAGE,
    )
    require_planner_role("admin")
    require_admin_role("admin")


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
