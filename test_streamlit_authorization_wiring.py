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
        "_render_saved_page",
    ):
        assert "require_planner_role" in _function_calls(function_name)


def test_admin_route_has_a_direct_admin_guard() -> None:
    assert "require_admin_role" in _function_calls("_render_user_management")


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
