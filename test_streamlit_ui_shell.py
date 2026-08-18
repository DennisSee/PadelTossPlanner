"""Statische regressietests voor globale layout en navigatiestyling."""

import ast
from pathlib import Path


APP_PATH = Path(__file__).with_name("streamlit_app.py")
SOURCE = APP_PATH.read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)


def _function(function_name: str) -> ast.FunctionDef:
    return next(
        node
        for node in TREE.body
        if isinstance(node, ast.FunctionDef) and node.name == function_name
    )


def _name_calls(function_name: str) -> list[str]:
    return [
        node.func.id
        for node in ast.walk(_function(function_name))
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    ]


def test_global_design_system_is_injected_exactly_once() -> None:
    assert SOURCE.count("design_system_stylesheet()") == 1
    assert _name_calls("_inject_app_styles").count("design_system_stylesheet") == 1
    assert _name_calls("main").count("_inject_app_styles") == 1
    assert "_inject_responsive_styles" not in SOURCE


def test_one_reusable_header_is_used_by_signup_and_regular_page_shell() -> None:
    assert "app_header_html" in _name_calls("_public_brand_header_html")
    signup_source = ast.get_source_segment(
        SOURCE,
        _function("_render_participant_signup_page"),
    )
    main_source = ast.get_source_segment(SOURCE, _function("main"))
    assert signup_source is not None and '_public_brand_header_html("Aanmelden")' in signup_source
    assert main_source is not None and "_public_brand_header_html(page)" in main_source


def test_sidebar_keeps_existing_routing_and_direct_guards() -> None:
    main_source = ast.get_source_segment(SOURCE, _function("main"))
    login_source = ast.get_source_segment(SOURCE, _function("_render_login"))
    assert main_source is not None
    assert login_source is not None
    assert "navigation_pages_for_role" in main_source
    assert 'st.radio("Navigatie"' in main_source
    assert "st.navigation" not in SOURCE
    assert "sidebar_account_html" in login_source
    assert 'key="sidebar_logout"' in login_source


def test_global_refactor_does_not_add_inline_styles_around_individual_pages() -> None:
    # De bestaande wedstrijdcomponenten hebben één gespecialiseerde stylesheet;
    # de nieuwe globale regels staan uitsluitend in ui_design.py.
    assert SOURCE.count("<style>") == 1
    for page_function in (
        "_render_participant_home_page",
        "_render_open_tos_page",
        "_render_planner_page",
        "_render_event_management_page",
        "_render_member_management_page",
    ):
        source = ast.get_source_segment(SOURCE, _function(page_function))
        assert source is not None and "<style>" not in source
