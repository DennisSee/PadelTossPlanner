"""Statische regressietests voor de mobiele participantpagina's."""

import ast
from pathlib import Path


APP_PATH = Path(__file__).with_name("streamlit_app.py")
SOURCE = APP_PATH.read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)


def _function_source(function_name: str) -> str:
    function = next(
        node
        for node in TREE.body
        if isinstance(node, ast.FunctionDef) and node.name == function_name
    )
    source = ast.get_source_segment(SOURCE, function)
    assert source is not None
    return source


def test_participant_home_contains_requested_sections_and_friendly_empty_state() -> None:
    source = _function_source("_render_participant_home_page")
    assert '"Mijn komende TOS"' in source
    assert '"Open voor inschrijving"' in source
    assert '"Openbaar schema"' in source
    assert "Je bent nog niet aangemeld voor een komende TOS." in source
    assert "latest_published_schedule" in source


def test_open_tos_uses_user_scoped_reads_and_safe_names_rpc() -> None:
    loader_source = _function_source("_load_participant_dashboard_data")
    card_source = _function_source("_render_open_event_card")
    page_source = _function_source("_render_open_tos_page")

    assert "list_own_upcoming_registrations" in loader_source
    assert "list_open_events" in loader_source
    assert "list_event_attendee_names" in card_source
    assert "attendee_names_preview" in card_source
    assert "registration_cta_label" in card_source
    assert "participant_count_html" in card_source
    assert "participant_attendee_names_html" in card_source
    assert "_get_admin_store" not in page_source
    assert "service_role" not in page_source


def test_participant_cards_show_no_technical_or_private_identity_fields() -> None:
    own_source = _function_source("_render_own_registration_card")
    open_source = _function_source("_render_open_event_card")
    visible_source = own_source + open_source

    assert '"Aanmelding wijzigen"' in own_source
    assert "participant_event_header_html" in own_source
    assert "participant_registration_status_html" in own_source
    assert "_registration_availability_text" in own_source
    assert "event_allows_self_service" in own_source
    assert "Deze aanmelding kan niet meer worden gewijzigd." in own_source
    assert "signup_deadline" in own_source
    assert 'type="primary"' in own_source
    assert 'type="primary"' in open_source
    assert "event.get(\"slug\")" in visible_source  # Alleen voor interne routing.
    for private_label in (
        "e-mail",
        "ranking",
        "member_id",
        "user_id",
        "approval_status",
    ):
        assert private_label not in visible_source


def test_participant_cards_use_central_badges_and_clear_status_accents() -> None:
    accent_source = _function_source("_participant_event_accent")
    open_source = _function_source("_render_open_event_card")

    assert 'return "cancelled"' in accent_source
    assert 'return "closed"' in accent_source
    assert 'return "registered"' in accent_source
    assert 'return "open"' in accent_source
    assert "participant_event_header_html" in open_source
    assert "participant_registration_status_html" in open_source
    assert "participant_deadline_html" in open_source


def test_signup_navigation_uses_only_validated_internal_context() -> None:
    source = _function_source("_navigate_to_signup")
    assert "signup_context_from_query_params" in source
    assert '{"page": "signup", "event":' in source
    assert "SignupReturnContext(" not in source
    assert "_replace_query_params(context.query_params)" in source
