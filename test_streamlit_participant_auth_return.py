"""Regressietests voor expliciete home- en signup-returnroutes na Auth."""

import inspect
from types import SimpleNamespace

import pytest

import streamlit_app as app
from authorization import (
    MembershipStatus,
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


class _SignupStreamlit:
    def __init__(self, *, submit: bool = False) -> None:
        self.session_state: dict[str, object] = {}
        self.submit = submit
        self.captions: list[str] = []
        self.errors: list[str] = []
        self.infos: list[str] = []

    def __enter__(self) -> "_SignupStreamlit":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def markdown(self, *_args: object, **_kwargs: object) -> None:
        return None

    def button(self, *_args: object, **_kwargs: object) -> bool:
        return False

    def caption(self, message: object) -> None:
        self.captions.append(str(message))

    def error(self, message: object) -> None:
        self.errors.append(str(message))

    def info(self, message: object) -> None:
        self.infos.append(str(message))

    def warning(self, message: object) -> None:
        self.infos.append(str(message))

    def radio(self, *_args: object, **_kwargs: object) -> str:
        return "attending"

    def form(self, *_args: object, **_kwargs: object) -> "_SignupStreamlit":
        return self

    def columns(self, count: int) -> list["_SignupStreamlit"]:
        return [self for _ in range(count)]

    def time_input(self, _label: str, *, value: object, **_kwargs: object) -> object:
        return value

    def form_submit_button(self, *_args: object, **_kwargs: object) -> bool:
        return self.submit


class _SignupRepository:
    def __init__(
        self,
        session: PersistentAuthSession,
        *,
        member: dict[str, object] | None,
        event_status: str = "closed",
        registration: dict[str, object] | None = None,
    ) -> None:
        self.session = session
        self.member = member
        self.registration = registration
        self.requested_slugs: list[str] = []
        self.saved: list[tuple[tuple[object, ...], dict[str, object]]] = []
        self.profile = {
            "id": session.user.id,
            "display_name": session.user.display_name,
            "role": session.user.role,
            "active": True,
            "member_id": session.user.member_id,
        }
        self.event = {
            "id": "event-vrijdag",
            "slug": "vrijdag-tos",
            "sport": "padel",
            "title": "Vrijdag TOS",
            "status": event_status,
            "starts_at": "2099-08-28T18:00:00+00:00",
            "ends_at": "2099-08-28T20:00:00+00:00",
            "signup_deadline": None,
        }

    def get_event_by_slug(self, slug: str) -> dict[str, object]:
        self.requested_slugs.append(slug)
        return self.event

    def get_own_profile(self) -> dict[str, object]:
        return self.profile

    def get_linked_club_member(self) -> dict[str, object] | None:
        return self.member

    def get_own_registration(self, _event_id: str) -> dict[str, object] | None:
        return self.registration

    def save_own_registration(self, *args: object, **kwargs: object) -> None:
        self.saved.append((args, kwargs))


def _install_signup_fakes(
    monkeypatch: pytest.MonkeyPatch,
    session: PersistentAuthSession,
    repository: _SignupRepository,
    fake_st: _SignupStreamlit,
) -> None:
    monkeypatch.setattr(app, "st", fake_st)
    monkeypatch.setattr(app, "_current_auth_session", lambda: session)
    monkeypatch.setattr(
        app,
        "_get_user_registration_repository",
        lambda *_args: repository,
    )
    monkeypatch.setattr(app, "_render_signup_event_summary", lambda _event: True)


@pytest.mark.parametrize("role", ["participant", "planner", "admin"])
def test_every_member_role_renders_the_same_user_scoped_signup_path(
    monkeypatch: pytest.MonkeyPatch,
    role: str,
) -> None:
    session = _session(role)
    member = {
        "id": session.user.member_id,
        "display_name": f"Clublid {role}",
        "approval_status": "approved",
        "active": True,
    }
    repository = _SignupRepository(session, member=member)
    fake_st = _SignupStreamlit()
    _install_signup_fakes(monkeypatch, session, repository, fake_st)

    app._render_participant_signup_page(
        object(),
        object(),
        object(),
        ParticipantReturnContext.signup("vrijdag-tos"),
    )

    assert repository.requested_slugs == ["vrijdag-tos"]
    assert fake_st.captions == [f"Ingelogd als Clublid {role}"]
    assert fake_st.errors == []
    assert session.user.role == role


def test_signup_display_name_has_a_safe_session_fallback() -> None:
    user = _session("planner").user
    assert app._participant_signup_display_name(None, user) == "Planner"
    assert app._participant_signup_display_name(
        {"display_name": "Clubnaam"},
        user,
    ) == "Clubnaam"


def test_admin_member_reaches_existing_registration_update_without_role_change(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = _session("admin")
    member = {
        "id": session.user.member_id,
        "display_name": "Clubadmin",
        "approval_status": "approved",
        "active": True,
    }
    repository = _SignupRepository(
        session,
        member=member,
        event_status="open",
        registration={"id": "registration-admin", "response": "attending"},
    )
    fake_st = _SignupStreamlit(submit=True)
    finished: list[bool] = []
    _install_signup_fakes(monkeypatch, session, repository, fake_st)
    monkeypatch.setattr(
        app,
        "_finish_participant_registration_save",
        lambda *, was_existing: finished.append(was_existing),
    )

    app._render_participant_signup_page(
        object(),
        object(),
        object(),
        ParticipantReturnContext.signup("vrijdag-tos"),
    )

    assert len(repository.saved) == 1
    _args, kwargs = repository.saved[0]
    assert kwargs["registration_id"] == "registration-admin"
    assert finished == [True]
    assert session.user.role == "admin"


@pytest.mark.parametrize(
    ("member_id", "member", "expected_status"),
    [
        (None, None, MembershipStatus.NEEDS_ONBOARDING),
        (
            "member-admin",
            {
                "id": "member-admin",
                "display_name": "Admin",
                "approval_status": "pending",
                "active": True,
            },
            MembershipStatus.PENDING_APPROVAL,
        ),
        (
            "member-admin",
            {
                "id": "member-admin",
                "display_name": "Admin",
                "approval_status": "rejected",
                "active": True,
            },
            MembershipStatus.REJECTED,
        ),
        (
            "member-admin",
            {
                "id": "member-admin",
                "display_name": "Admin",
                "approval_status": "approved",
                "active": False,
            },
            MembershipStatus.MEMBER_INACTIVE,
        ),
        (
            "member-admin",
            {
                "id": "ander-member",
                "display_name": "Ander",
                "approval_status": "approved",
                "active": True,
            },
            None,
        ),
    ],
)
def test_invalid_or_incomplete_staff_membership_stops_before_member_dereference(
    monkeypatch: pytest.MonkeyPatch,
    member_id: str | None,
    member: dict[str, object] | None,
    expected_status: MembershipStatus | None,
) -> None:
    base = _session("admin")
    session = PersistentAuthSession(
        user=AuthenticatedUser(
            id=base.user.id,
            email=base.user.email,
            display_name=base.user.display_name,
            role=base.user.role,
            member_id=member_id,
        ),
        access_token=base.access_token,
        refresh_token=base.refresh_token,
    )
    repository = _SignupRepository(session, member=member)
    fake_st = _SignupStreamlit()
    seen_statuses: list[MembershipStatus] = []
    _install_signup_fakes(monkeypatch, session, repository, fake_st)
    monkeypatch.setattr(
        app,
        "_render_participant_membership_gate",
        lambda _repository, _user, _profile, capability, **_kwargs: (
            seen_statuses.append(capability.status) or False
        ),
    )

    app._render_participant_signup_page(
        object(),
        object(),
        object(),
        ParticipantReturnContext.signup("vrijdag-tos"),
    )

    assert seen_statuses == ([expected_status] if expected_status else [])
    if expected_status is None:
        assert fake_st.errors == [
            "Je ledenkoppeling geeft geen toegang tot deze functie."
        ]
    assert fake_st.captions == []
    assert session.user.role == "admin"


def test_signup_source_has_no_participant_role_gate_or_unchecked_member_access() -> None:
    source = inspect.getsource(app._render_participant_signup_page)
    assert "profile, member, capability" in source
    assert "isinstance(member, Mapping)" in source
    assert "_participant_signup_display_name(member, session.user)" in source
    assert 'role == "participant"' not in source
    assert "_get_user_registration_repository" in source
    assert "repository.save_own_registration" in source
