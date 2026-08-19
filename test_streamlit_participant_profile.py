"""Regressietests voor het user-scoped profiel en post-signup routing."""

from __future__ import annotations

import ast
from pathlib import Path
from types import SimpleNamespace

import streamlit_app
from authorization import MY_TOS_PAGE
from database import AuthenticatedUser, PersistentAuthSession


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


def test_profile_page_is_user_scoped_guarded_and_edits_only_the_name() -> None:
    source = _function_source("_render_participant_profile_page")
    assert "require_participant_access" in source
    assert "_load_participant_capability" in source
    assert "update_own_display_name(display_name)" in source
    assert "_refresh_participant_session_profile" in source
    assert '"E-mailadres"' in source
    assert "disabled=True" in source
    assert '"Naam opslaan"' in source
    assert "_get_admin_store" not in source
    assert "service_role" not in source


def test_profile_save_refreshes_visible_user_but_preserves_all_tokens(monkeypatch) -> None:
    original = PersistentAuthSession(
        user=AuthenticatedUser(
            id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            email="dennis@example.test",
            display_name="dennis",
            role="participant",
        ),
        access_token="access-secret",
        refresh_token="refresh-secret",
        expires_at=2_000_000_000,
    )
    captured: dict[str, object] = {}
    monkeypatch.setattr(streamlit_app, "_current_auth_session", lambda: original)
    monkeypatch.setattr(
        streamlit_app,
        "_set_auth_session",
        lambda session, *, persisted: captured.update(
            session=session,
            persisted=persisted,
        ),
    )
    monkeypatch.setattr(
        streamlit_app,
        "st",
        SimpleNamespace(session_state={"auth_persisted": True}),
    )

    updated_user = streamlit_app._refresh_participant_session_profile(
        {
            "id": original.user.id,
            "display_name": "Dennis Seesing",
            "member_id": "member-dennis",
        }
    )

    updated_session = captured["session"]
    assert isinstance(updated_session, PersistentAuthSession)
    assert updated_user.display_name == "Dennis Seesing"
    assert updated_session.user.display_name == "Dennis Seesing"
    assert updated_session.user.member_id == "member-dennis"
    assert updated_session.access_token == original.access_token
    assert updated_session.refresh_token == original.refresh_token
    assert updated_session.expires_at == original.expires_at
    assert captured["persisted"] is True


def test_successful_registration_clears_deeplink_and_returns_to_my_tos(monkeypatch) -> None:
    state = {
        "signup_return_context": object(),
        "navigation_page": "Live TOS-schema",
    }
    replaced: list[dict[str, str]] = []
    reruns: list[bool] = []
    monkeypatch.setattr(
        streamlit_app,
        "st",
        SimpleNamespace(
            session_state=state,
            rerun=lambda: reruns.append(True),
        ),
    )
    monkeypatch.setattr(
        streamlit_app,
        "_replace_query_params",
        lambda params: replaced.append(dict(params)),
    )

    streamlit_app._finish_participant_registration_save(was_existing=False)

    assert "signup_return_context" not in state
    assert state["navigation_page"] == MY_TOS_PAGE
    assert state["participant_registration_notice"] == "Aanmelding opgeslagen"
    assert replaced == [{}]
    assert reruns == [True]

    streamlit_app._finish_participant_registration_save(was_existing=True)
    assert state["participant_registration_notice"] == "Aanmelding gewijzigd"


def test_registration_error_paths_do_not_call_post_save_navigation() -> None:
    source = _function_source("_render_participant_signup_page")
    save_index = source.index("repository.save_own_registration(")
    finish_index = source.index("_finish_participant_registration_save(")
    first_except_index = source.index("except (ParticipantRegistrationError")
    assert save_index < finish_index < first_except_index
    assert "_finish_participant_registration_save" not in source[first_except_index:]


def test_main_routes_profile_only_through_participant_repository() -> None:
    source = _function_source("main")
    assert "MY_PROFILE_PAGE" in source
    assert "_render_participant_profile_page(repository, user)" in source
    assert "_get_user_registration_repository" in source
