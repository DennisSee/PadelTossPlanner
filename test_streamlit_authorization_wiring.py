"""Statische guardtests zonder een Streamlit-server te starten."""

import ast
from pathlib import Path


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
