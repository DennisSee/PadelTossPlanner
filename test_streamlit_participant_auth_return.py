"""Regressietests voor expliciete home- en signup-returnroutes na Auth."""

import inspect
from types import SimpleNamespace

import pytest

import streamlit_app as app
from authorization import (
    MY_TOS_PAGE,
    PLANNER_PAGE,
    PUBLIC_PAGE,
    ParticipantReturnContext,
)
from database import AuthenticatedUser, PersistentAuthSession


def _session(role: str) -> PersistentAuthSession:
    return PersistentAuthSession(
        user=AuthenticatedUser(
            id=f"user-{role}",
            email=f"{role}@example.test",
            display_name=role.title(),
            role=role,
            member_id=f"member-{role}",
        ),
        access_token=f"{role}-access-token",
        refresh_token=f"{role}-refresh-token",
    )


def _install_finish_fakes(
    monkeypatch: pytest.MonkeyPatch,
    initial_state: dict[str, object],
) -> tuple[dict[str, object], list[dict[str, str]]]:
    state = dict(initial_state)
    query_replacements: list[dict[str, str]] = []
    monkeypatch.setattr(app, "st", SimpleNamespace(session_state=state))
    monkeypatch.setattr(app, "_save_persistent_cookie", lambda *args, **kwargs: None)
    monkeypatch.setattr(app, "_set_auth_session", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        app,
        "_replace_query_params",
        lambda params: query_replacements.append(dict(params)),
    )
    return state, query_replacements


def test_root_otp_success_cleans_auth_state_and_navigates_to_my_tos(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state, query_replacements = _install_finish_fakes(
        monkeypatch,
        {
            app.PARTICIPANT_OTP_EMAIL_STATE: "participant@example.test",
            app.PARTICIPANT_ROOT_LOGIN_STATE: True,
            "signup_return_context": ParticipantReturnContext.signup("oude-tos"),
        },
    )

    app._finish_participant_login(
        _session("participant"),
        object(),
        ParticipantReturnContext.home(),
    )

    assert app.PARTICIPANT_OTP_EMAIL_STATE not in state
    assert app.PARTICIPANT_ROOT_LOGIN_STATE not in state
    assert "signup_return_context" not in state
    assert state["navigation_page"] == MY_TOS_PAGE
    assert state["login_success"] is True
    assert query_replacements == [{}]


@pytest.mark.parametrize("role", ["participant", "planner", "admin"])
def test_signup_auth_success_preserves_exact_validated_event_context(
    monkeypatch: pytest.MonkeyPatch,
    role: str,
) -> None:
    state, query_replacements = _install_finish_fakes(monkeypatch, {})
    context = ParticipantReturnContext.signup("vrijdag-tos")

    app._finish_participant_login(_session(role), object(), context)

    assert state["signup_return_context"] == context
    assert state["navigation_page"] == PUBLIC_PAGE
    assert query_replacements == [{"page": "signup", "event": "vrijdag-tos"}]


@pytest.mark.parametrize("role", ["planner", "admin"])
@pytest.mark.parametrize("auth_method", ["otp", "oauth"])
def test_staff_root_otp_or_oauth_starts_on_my_tos(
    monkeypatch: pytest.MonkeyPatch,
    role: str,
    auth_method: str,
) -> None:
    assert auth_method in {"otp", "oauth"}
    state, query_replacements = _install_finish_fakes(monkeypatch, {})

    app._finish_participant_login(
        _session(role),
        object(),
        ParticipantReturnContext.home(),
    )

    assert state["navigation_page"] == MY_TOS_PAGE
    assert query_replacements == [{}]


def test_staff_password_login_keeps_planner_as_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(app, "st", SimpleNamespace(session_state={}))

    assert app._post_login_page(_session("admin").user) == PLANNER_PAGE


def test_auth_options_uses_one_non_optional_context_for_otp_and_oauth() -> None:
    auth_source = inspect.getsource(app._render_participant_auth_options)
    root_source = inspect.getsource(app._render_participant_root_login_page)
    oauth_source = inspect.getsource(app._prepare_oauth_authorization)

    assert "context: ParticipantReturnContext" in auth_source
    assert "ParticipantReturnContext | None" not in auth_source
    assert "ParticipantReturnContext.home()" in root_source
    assert "cookies, None" not in root_source
    assert "event_slug=context.event_slug" in oauth_source
    assert "_finish_participant_login(session, cookies, context)" in auth_source


def test_invalid_otp_keeps_the_login_flow_and_password_login_is_unchanged() -> None:
    auth_source = inspect.getsource(app._render_participant_auth_options)
    password_source = inspect.getsource(app._render_login)

    assert "except AuthenticationError:" in auth_source
    assert "PARTICIPANT_AUTH_ERROR_STATE" in auth_source
    assert "OTP_CODE_USER_ERROR" in auth_source
    assert "sign_in_with_session" in password_source
