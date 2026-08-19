"""Statische guardtests zonder een Streamlit-server te starten."""

import ast
from pathlib import Path
from types import SimpleNamespace

import pytest

import streamlit_app as app
from authorization import (
    MEMBER_MANAGEMENT_ACCOUNTS,
    MEMBER_MANAGEMENT_PAGE,
    TOS_MANAGEMENT_EVENTS,
    TOS_MANAGEMENT_PAGE,
    TOS_MANAGEMENT_PLANNER,
    TOS_MANAGEMENT_SAVED,
)
from database import AuthenticatedUser


APP_PATH = Path(__file__).with_name("streamlit_app.py")


def _function_calls(function_name: str) -> set[str]:
    tree = ast.parse(APP_PATH.read_text(encoding="utf-8"))
    function = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == function_name
    )
    return {
        node.func.id
        for node in ast.walk(function)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    }


def test_every_planner_route_has_a_direct_role_guard() -> None:
    for function_name in (
        "_render_private_result",
        "_render_planner_page",
        "_render_event_management_page",
        "_render_member_management_page",
        "_render_saved_page",
    ):
        assert "require_planner_role" in _function_calls(function_name)


def test_admin_route_has_a_direct_admin_guard() -> None:
    assert "require_admin_role" in _function_calls("_render_user_management")


def test_compact_management_hubs_keep_direct_guards_and_admin_tab_nested() -> None:
    tos_calls = _function_calls("_render_tos_management_hub")
    member_calls = _function_calls("_render_member_management_hub")
    assert "require_planner_role" in tos_calls
    assert "require_planner_role" in member_calls
    assert {
        "_render_event_management_page",
        "_render_planner_page",
        "_render_saved_page",
    }.issubset(tos_calls)
    assert "_render_member_management_page" in member_calls
    assert "_render_user_management" in member_calls

    source = APP_PATH.read_text(encoding="utf-8")
    member_hub = ast.get_source_segment(
        source,
        next(
            node
            for node in ast.parse(source).body
            if isinstance(node, ast.FunctionDef)
            and node.name == "_render_member_management_hub"
        ),
    )
    assert member_hub is not None
    assert "if user.is_admin" in member_hub
    assert "MEMBER_MANAGEMENT_ACCOUNTS" in member_hub


def test_ranking_ui_uses_one_nullable_choice_and_keeps_sport_active() -> None:
    source = APP_PATH.read_text(encoding="utf-8")
    function = next(
        node
        for node in ast.parse(source).body
        if isinstance(node, ast.FunctionDef)
        and node.name == "_render_member_management_page"
    )
    member_source = ast.get_source_segment(source, function)
    assert member_source is not None
    assert "RANKING_OPTIONS" in member_source
    assert "ranking_option_index(current_ranking)" in member_source
    assert "format_func=ranking_option_label" in member_source
    assert "clear_ranking" not in member_source
    assert '"Sportprofiel actief"' in member_source
    assert "selected_ranking," in member_source


def _staff_user(role: str = "planner") -> AuthenticatedUser:
    return AuthenticatedUser(
        id=f"user-{role}",
        email=f"{role}@example.test",
        display_name=role.title(),
        role=role,
        member_id=f"member-{role}",
    )


@pytest.mark.parametrize(
    ("section", "expected_renderer"),
    [
        (TOS_MANAGEMENT_EVENTS, "events"),
        (TOS_MANAGEMENT_PLANNER, "planner"),
        (TOS_MANAGEMENT_SAVED, "saved"),
    ],
)
def test_tos_management_widget_state_selects_and_keeps_the_requested_renderer(
    monkeypatch: pytest.MonkeyPatch,
    section: str,
    expected_renderer: str,
) -> None:
    state = {app.TOS_MANAGEMENT_SECTION_STATE: section}
    rendered: list[str] = []
    fake_st = SimpleNamespace(
        session_state=state,
        secrets={},
        error=lambda _message: None,
        radio=lambda _label, _options, *, key, **_kwargs: state[key],
    )
    monkeypatch.setattr(app, "st", fake_st)
    monkeypatch.setattr(
        app,
        "public_base_url_from_secrets",
        lambda _secrets: "https://test.example",
    )
    monkeypatch.setattr(
        app,
        "_render_event_management_page",
        lambda *_args: rendered.append("events"),
    )
    monkeypatch.setattr(
        app,
        "_render_planner_page",
        lambda *_args: rendered.append("planner"),
    )
    monkeypatch.setattr(
        app,
        "_render_saved_page",
        lambda *_args: rendered.append("saved"),
    )

    app._render_tos_management_hub(object(), _staff_user())

    assert state[app.TOS_MANAGEMENT_SECTION_STATE] == section
    assert rendered == [expected_renderer]


def test_tos_management_default_only_applies_when_state_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state: dict[str, object] = {}
    rendered: list[str] = []
    monkeypatch.setattr(
        app,
        "st",
        SimpleNamespace(
            session_state=state,
            error=lambda _message: None,
            radio=lambda _label, _options, *, key, **_kwargs: state[key],
        ),
    )
    monkeypatch.setattr(
        app,
        "_render_planner_page",
        lambda *_args: rendered.append("planner"),
    )

    app._render_tos_management_hub(object(), _staff_user())

    assert state[app.TOS_MANAGEMENT_SECTION_STATE] == TOS_MANAGEMENT_PLANNER
    assert rendered == ["planner"]


def test_current_and_legacy_navigation_do_not_overwrite_later_widget_choices(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state: dict[str, object] = {
        "navigation_page": "Planner",
    }
    monkeypatch.setattr(app, "st", SimpleNamespace(session_state=state))
    planner = _staff_user()

    assert app._normalize_navigation_state(planner) == TOS_MANAGEMENT_PAGE
    assert state[app.TOS_MANAGEMENT_SECTION_STATE] == TOS_MANAGEMENT_PLANNER

    state[app.TOS_MANAGEMENT_SECTION_STATE] = TOS_MANAGEMENT_SAVED
    assert app._normalize_navigation_state(planner) == TOS_MANAGEMENT_PAGE
    assert state[app.TOS_MANAGEMENT_SECTION_STATE] == TOS_MANAGEMENT_SAVED


def test_member_management_uses_the_same_stable_state_owner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state: dict[str, object] = {
        "navigation_page": MEMBER_MANAGEMENT_PAGE,
        app.NAVIGATION_VERSION_STATE: app.NAVIGATION_STATE_VERSION,
        app.MEMBER_MANAGEMENT_SECTION_STATE: MEMBER_MANAGEMENT_ACCOUNTS,
    }
    rendered: list[str] = []
    fake_st = SimpleNamespace(
        session_state=state,
        error=lambda _message: None,
        radio=lambda _label, _options, *, key, **_kwargs: state[key],
    )
    monkeypatch.setattr(app, "st", fake_st)
    monkeypatch.setattr(
        app,
        "_render_user_management",
        lambda *_args: rendered.append("accounts"),
    )

    admin = _staff_user("admin")
    assert app._normalize_navigation_state(admin) == MEMBER_MANAGEMENT_PAGE
    app._render_member_management_hub(object(), admin)

    assert state[app.MEMBER_MANAGEMENT_SECTION_STATE] == MEMBER_MANAGEMENT_ACCOUNTS
    assert rendered == ["accounts"]


def test_event_management_route_uses_only_the_guarded_admin_store() -> None:
    calls = _function_calls("_render_event_management_page")
    assert "require_planner_role" in calls
    assert "_render_event_registration_import" in calls
    assert "_get_user_registration_repository" not in calls

    tree = ast.parse(APP_PATH.read_text(encoding="utf-8"))
    function = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "_render_event_management_page"
    )
    attributes = {
        node.func.attr
        for node in ast.walk(function)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }
    assert {
        "list_tos_events",
        "create_tos_event",
        "update_tos_event",
        "set_tos_event_status",
    }.issubset(attributes)


def test_registration_import_has_direct_guard_and_no_participant_repository() -> None:
    calls = _function_calls("_render_event_registration_import")
    assert "require_planner_role" in calls
    assert "build_registration_import_preview" in calls
    assert "merge_registration_import" in calls
    assert "_get_user_registration_repository" not in calls

    tree = ast.parse(APP_PATH.read_text(encoding="utf-8"))
    function = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "_render_event_registration_import"
    )
    attributes = {
        node.func.attr
        for node in ast.walk(function)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }
    assert {
        "list_event_registrations_for_import",
        "load_club_draft",
        "save_imported_club_draft_players",
    }.issubset(attributes)


def test_member_management_route_uses_only_guarded_admin_methods() -> None:
    calls = _function_calls("_render_member_management_page")
    assert "require_planner_role" in calls
    assert "_get_user_registration_repository" not in calls

    tree = ast.parse(APP_PATH.read_text(encoding="utf-8"))
    function = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "_render_member_management_page"
    )
    attributes = {
        node.func.attr
        for node in ast.walk(function)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }
    assert {
        "list_club_members",
        "get_member_approval_setting",
        "set_require_member_approval",
        "set_member_approval",
        "set_member_active",
        "upsert_member_sport_profile",
    }.issubset(attributes)


def test_user_repository_factory_is_not_streamlit_cached() -> None:
    tree = ast.parse(APP_PATH.read_text(encoding="utf-8"))
    function = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "_get_user_registration_repository"
    )
    assert function.decorator_list == []


def test_public_route_does_not_construct_or_use_admin_store() -> None:
    tree = ast.parse(APP_PATH.read_text(encoding="utf-8"))
    function = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "_render_public_page"
    )
    attribute_calls = {
        node.func.attr
        for node in ast.walk(function)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }
    assert "latest_published_schedule" in attribute_calls
    assert "latest_public_schedule" not in attribute_calls

    main_calls = _function_calls("main")
    assert "_get_public_schedule_repository" in main_calls


def test_participant_signup_route_uses_only_user_scoped_repository() -> None:
    calls = _function_calls("_render_participant_signup_page")
    assert "_get_user_registration_repository" in calls
    assert "_get_admin_store" not in calls

    tree = ast.parse(APP_PATH.read_text(encoding="utf-8"))
    function = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "_render_participant_signup_page"
    )
    attributes = {
        node.func.attr
        for node in ast.walk(function)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }
    assert "_load_participant_capability" in calls
    assert "_render_participant_membership_gate" in calls
    assert "get_event_by_slug" in attributes
    assert "get_own_registration" in attributes
    assert "save_own_registration" in attributes
    assert not {"insert", "update", "upsert", "delete"} & attributes

    capability_calls = _function_calls("_load_participant_capability")
    gate_calls = _function_calls("_render_participant_membership_gate")
    assert "participant_capability" in capability_calls
    assert "_refresh_participant_session_profile" in capability_calls
    assert "_refresh_participant_session_profile" in gate_calls


def test_participant_dashboard_routes_have_direct_guards_and_no_admin_store() -> None:
    for function_name in (
        "_render_participant_home_page",
        "_render_open_tos_page",
        "_render_participant_profile_page",
    ):
        calls = _function_calls(function_name)
        assert "require_participant_access" in calls
        assert "_load_participant_capability" in calls
        assert "_get_admin_store" not in calls

    home_calls = _function_calls("_render_participant_home_page")
    assert "_load_participant_dashboard_data" in home_calls
    open_calls = _function_calls("_render_open_tos_page")
    assert "_load_participant_dashboard_data" in open_calls
    profile_calls = _function_calls("_render_participant_profile_page")
    assert "_refresh_participant_session_profile" in profile_calls


def test_staff_without_member_reuses_the_user_scoped_onboarding_gate() -> None:
    tree = ast.parse(APP_PATH.read_text(encoding="utf-8"))
    gate = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "_render_participant_membership_gate"
    )
    gate_attributes = {
        node.func.attr
        for node in ast.walk(gate)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }

    assert "self_onboard_member" in gate_attributes
    assert "get_own_profile" in gate_attributes
    assert "_get_admin_store" not in _function_calls(
        "_render_participant_membership_gate"
    )
    for page in (
        "_render_participant_home_page",
        "_render_open_tos_page",
        "_render_participant_profile_page",
    ):
        assert "_render_participant_membership_gate" in _function_calls(page)


def test_oauth_callback_runs_before_restore_and_uses_current_query_api() -> None:
    source = APP_PATH.read_text(encoding="utf-8")
    tree = ast.parse(source)
    main = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "main"
    )
    ordered_calls = [
        node.func.id
        for node in ast.walk(main)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    ]
    assert ordered_calls.index("_handle_oauth_callback") < ordered_calls.index(
        "_restore_persistent_auth"
    )
    assert "experimental_get_query_params" not in source
    assert "experimental_set_query_params" not in source
