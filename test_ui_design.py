"""Tests voor het centrale T.C. Zuid TOS-designsysteem."""

from pathlib import Path

import pytest

from ui_design import (
    DESIGN_TOKENS,
    app_header_html,
    design_system_stylesheet,
    participant_attendee_names_html,
    participant_count_html,
    participant_deadline_html,
    participant_event_header_html,
    participant_registration_status_html,
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
    assert "padding: 2.62rem 0.72rem 1.85rem" in stylesheet
    assert "padding: 2.55rem 0.62rem 1.75rem" in stylesheet
    assert "min-height: 2.85rem" in stylesheet


def test_cookie_component_footprint_fix_is_narrow_and_keeps_component_mounted() -> None:
    stylesheet = design_system_stylesheet()
    assert 'iframe[title$="CookieManager.sync_cookies"]' in stylesheet
    assert '[data-testid="stElementContainer"]:has(' in stylesheet
    assert "position: absolute !important" in stylesheet
    assert "iframe {" not in stylesheet
    assert '[data-testid="stCustomComponentV1"] {' not in stylesheet
    assert "display: none" not in stylesheet.split(
        'iframe[title$="CookieManager.sync_cookies"]',
        1,
    )[1].split("}", 1)[0]


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
    assert ".tos-participant-event--registered" in stylesheet
    assert ".tos-participant-event--open" in stylesheet
    assert ".tos-participant-event--closed" in stylesheet
    assert ".tos-participant-event--cancelled" in stylesheet


def test_form_controls_have_specific_surface_interaction_and_disabled_states() -> None:
    stylesheet = design_system_stylesheet()
    for test_id in (
        "stTextInput",
        "stNumberInput",
        "stDateInput",
        "stTimeInput",
        "stSelectbox",
        "stMultiSelect",
        "stTextArea",
    ):
        assert f'[data-testid="{test_id}"]' in stylesheet
    assert '[data-testid="stTextInputRootElement"]:focus-within' in stylesheet
    assert '[data-testid="stNumberInputContainer"]:focus-within' in stylesheet
    assert '.react-aria-ComboBox > [role="group"]:focus-within' in stylesheet
    assert '[data-baseweb="select"]:focus-within > div' in stylesheet
    assert ':has(input:disabled)' in stylesheet
    assert ':has(input[readonly])' in stylesheet
    assert ':has([aria-disabled="true"]) > div' in stylesheet
    assert "border: 1px solid var(--tc-border)" in stylesheet
    assert "border-color: var(--tc-green)" in stylesheet
    assert "background: var(--tc-surface-subtle)" in stylesheet
    assert "min-height: 2.9rem" in stylesheet


def test_form_control_rules_do_not_target_editor_or_choice_components() -> None:
    stylesheet = design_system_stylesheet()
    controls_start = stylesheet.index(
        "/* Alleen normale BaseWeb-formcontrols"
    )
    controls_end = stylesheet.index("input:focus-visible", controls_start)
    controls = stylesheet[controls_start:controls_end]
    for excluded in (
        "stDataEditor",
        "stBaseButton",
        "stPills",
        "stRadio",
        "stCheckbox",
    ):
        assert excluded not in controls


def test_participant_event_datetime_is_stronger_than_deadline_but_wraps() -> None:
    stylesheet = design_system_stylesheet()
    metadata_start = stylesheet.index(".tos-participant-event-meta {")
    metadata_end = stylesheet.index("}", metadata_start)
    metadata = stylesheet[metadata_start:metadata_end]
    assert "font-size: 0.88rem" in metadata
    assert "font-weight: 650" in metadata
    assert "font-variant-numeric: tabular-nums" in metadata
    assert "white-space: normal" in metadata
    assert "overflow-wrap: anywhere" in metadata
    assert "var(--tc-text) 82%" in metadata

    secondary_start = stylesheet.index(".tos-participant-deadline,")
    secondary_end = stylesheet.index("}", secondary_start)
    secondary = stylesheet[secondary_start:secondary_end]
    assert "font-size: 0.82rem" in secondary
    assert "font-weight: 650" not in secondary


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


def test_participant_components_create_compact_semantic_hierarchy() -> None:
    header = participant_event_header_html(
        sport="padel",
        title="Vrijdagavond <TOS>",
        metadata="vrijdag 21 augustus · 20:00–22:00",
        status="open",
        accent="registered",
    )
    assert "tos-participant-event--registered" in header
    assert ">PADEL<" in header
    assert ">Open<" in header
    assert "Vrijdagavond &lt;TOS&gt;" in header
    assert "20:00–22:00" in header

    personal = participant_registration_status_html("attending", "20:00–21:50")
    assert "✓ Aangemeld" in personal
    assert "20:00–21:50" in personal
    assert personal.count("tos-badge ") == 2
    assert "Ik doe niet mee" in participant_registration_status_html("declined")

    assert "12 deelnemers" in participant_count_html(12)
    assert "1 deelnemer" in participant_count_html(1)
    with pytest.raises(ValueError):
        participant_count_html(-1)
    assert "Inschrijven t/m" in participant_deadline_html("Inschrijven t/m 18 aug")
    assert "Dennis &amp; Marieke" in participant_attendee_names_html(
        "Dennis & Marieke"
    )
    with pytest.raises(ValueError):
        participant_event_header_html(
            sport="padel",
            title="TOS",
            metadata="nu",
            status="open",
            accent="luid",  # type: ignore[arg-type]
        )


def test_official_streamlit_theme_uses_the_same_core_palette() -> None:
    config = Path(".streamlit/config.toml").read_text(encoding="utf-8")
    assert f'primaryColor = "{DESIGN_TOKENS["club_green"]}"' in config
    assert f'backgroundColor = "{DESIGN_TOKENS["page_background"]}"' in config
    assert (
        f'secondaryBackgroundColor = "{DESIGN_TOKENS["surface_background"]}"'
        in config
    )
    assert f'textColor = "{DESIGN_TOKENS["text"]}"' in config
