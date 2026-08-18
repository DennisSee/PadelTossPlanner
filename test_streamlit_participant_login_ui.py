"""Statische regressietests voor de compacte participant-login en PKCE-staging."""

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


def test_participant_login_hides_slug_and_role_implementation_text() -> None:
    signup_source = _function_source("_render_participant_signup_page")
    auth_source = _function_source("_render_participant_auth_options")

    assert "Aanmeldpagina ·" not in signup_source
    assert "Je account krijgt standaard uitsluitend de rol Deelnemer" not in auth_source
    assert "← Terug naar openbaar schema" not in signup_source
    assert '"← Terug"' in signup_source


def test_participant_login_shows_event_and_required_auth_choices() -> None:
    summary_source = _function_source("_render_signup_event_summary")
    auth_source = _function_source("_render_participant_auth_options")

    assert "event_sport_label" in summary_source
    assert "format_event_date" in summary_source
    assert "window.local_start" in summary_source
    assert "window.local_end" in summary_source
    assert "SUPPORTED_OAUTH_PROVIDERS" in auth_source
    assert "oauth_provider_label" in auth_source
    assert "Doorgaan met " in auth_source
    assert '"E-mailadres"' in auth_source
    assert "Stuur mij een inlogcode" in auth_source
    assert "zescijfer" not in auth_source
    assert "EMAIL_OTP_MAX_INPUT_LENGTH" in auth_source
    assert "tos-login-separator" in auth_source
    assert "T.C. Zuid TOS" in _function_source("_public_brand_header_html")
    assert "st-key-participant_oauth_google" in SOURCE
    assert "st-key-participant_oauth_apple" in SOURCE
    assert "data:image/svg+xml;base64" in SOURCE


def test_oauth_redirect_link_is_only_rendered_after_cookie_confirmation() -> None:
    prepare_source = _function_source("_prepare_oauth_authorization")
    confirmed_source = _function_source("_render_confirmed_oauth_link")
    auth_source = _function_source("_render_participant_auth_options")

    assert "_queue_oauth_pending_cookie" in prepare_source
    assert "st.link_button" not in prepare_source
    assert "cookies.save" not in _function_source("_queue_oauth_pending_cookie")
    assert "confirmed_oauth_pending_cookie" in confirmed_source
    assert confirmed_source.index("confirmed_oauth_pending_cookie") < (
        confirmed_source.index("st.link_button")
    )
    assert "st.rerun()" in auth_source
    assert "sleep(" not in SOURCE


def test_pkce_cookie_names_never_reuse_the_persistent_session_cookie() -> None:
    save_source = _function_source("_queue_oauth_pending_cookie")
    callback_source = _function_source("_handle_oauth_callback")

    assert "oauth_pending_cookie_name" in save_source
    assert "AUTH_COOKIE_NAME" not in save_source
    assert 'AUTH_COOKIE_NAME = "supabase_refresh_token"' in SOURCE
    assert 'return f"supabase_pkce_' in Path(__file__).with_name(
        "participant_auth.py"
    ).read_text(encoding="utf-8")
    assert "save_cookie=False" in callback_source
    assert "_clear_oauth_pending_cookies" in callback_source


def test_participant_ui_does_not_render_raw_auth_exceptions() -> None:
    auth_source = _function_source("_render_participant_auth_options")
    callback_source = _function_source("_handle_oauth_callback")

    assert "str(exc)" not in auth_source
    assert "str(exc)" not in callback_source
    assert "OTP_CODE_USER_ERROR" in auth_source
    assert "oauth_storage_user_error" in callback_source
