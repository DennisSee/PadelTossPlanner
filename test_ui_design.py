"""Tests voor het centrale T.C. Zuid TOS-designsysteem."""

from pathlib import Path

import pytest

from ui_design import (
    DESIGN_TOKENS,
    app_header_html,
    design_system_stylesheet,
    sidebar_account_html,
    status_badge_html,
)


def test_design_system_contains_required_semantic_tokens() -> None:
    assert {
        "club_green",
        "club_green_dark",
        "club_yellow",
        "page_background",
        "surface_background",
        "text",
        "muted_text",
        "border",
        "success",
        "warning",
        "danger",
        "radius",
        "shadow",
        "space_1",
        "space_6",
    }.issubset(DESIGN_TOKENS)

    stylesheet = design_system_stylesheet()
    assert stylesheet.count('id="tc-zuid-design-system"') == 1
    for token_value in DESIGN_TOKENS.values():
        assert token_value in stylesheet


def test_layout_has_bounded_desktop_width_and_mobile_first_breakpoints() -> None:
    stylesheet = design_system_stylesheet()
    assert "max-width: 1180px" in stylesheet
    assert "@media (max-width: 1100px)" in stylesheet
    assert "@media (max-width: 700px)" in stylesheet
    assert "@media (max-width: 430px)" in stylesheet
    assert "padding: 2.85rem 0.72rem 2rem" in stylesheet
    assert "min-height: 2.85rem" in stylesheet


def test_global_styles_cover_navigation_focus_cards_buttons_and_badges() -> None:
    stylesheet = design_system_stylesheet()
    assert '[data-testid="stSidebar"]' in stylesheet
    assert 'label[data-baseweb="radio"]:has(input:checked)' in stylesheet
    assert ":focus-visible" in stylesheet
    assert '[data-testid="stVerticalBlockBorderWrapper"]' in stylesheet
    assert '[data-testid="stBaseButton-primary"]' in stylesheet
    assert '[data-testid="stBaseButton-secondary"]' in stylesheet
    assert '[data-testid="stBaseButton-tertiary"]' in stylesheet
    assert ".tos-badge--success" in stylesheet
    assert ".tos-badge--warning" in stylesheet
    assert ".tos-badge--danger" in stylesheet


def test_header_badges_and_sidebar_account_escape_visible_text() -> None:
    header = app_header_html(
        "data:image/png;base64,abc",
        page_title='<script>alert("x")</script>',
    )
    assert "T.C. Zuid TOS" in header
    assert "tos-app-logo" in header
    assert "<script>" not in header
    assert "&lt;script&gt;" in header

    badge = status_badge_html("Open & klaar", "success")
    assert "tos-badge--success" in badge
    assert "Open &amp; klaar" in badge
    with pytest.raises(ValueError):
        status_badge_html("Onbekend", "purple")  # type: ignore[arg-type]

    account = sidebar_account_html("<Dennis>", "Deelnemer")
    assert "&lt;Dennis&gt;" in account
    assert "tos-sidebar-account" in account
    assert "Deelnemer" in account


def test_official_streamlit_theme_uses_the_same_core_palette() -> None:
    config = Path(".streamlit/config.toml").read_text(encoding="utf-8")
    assert f'primaryColor = "{DESIGN_TOKENS["club_green"]}"' in config
    assert f'backgroundColor = "{DESIGN_TOKENS["page_background"]}"' in config
    assert (
        f'secondaryBackgroundColor = "{DESIGN_TOKENS["surface_background"]}"'
        in config
    )
    assert f'textColor = "{DESIGN_TOKENS["text"]}"' in config
