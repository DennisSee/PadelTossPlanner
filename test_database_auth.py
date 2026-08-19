"""Unit-tests voor login, tokenrotatie en veilige cookieconfiguratie."""

from types import SimpleNamespace

import pytest

from database import (
    AdminSupabaseStore,
    AuthenticatedUser,
    ConfigurationError,
    PersistentAuthSession,
    SupabaseAuthService,
    SupabaseConfig,
    auth_cookie_config_from_secrets,
    config_from_secrets,
    public_config_from_secrets,
)


class _Postgrest:
    def __init__(self) -> None:
        self.access_token: str | None = None

    def auth(self, access_token: str) -> None:
        self.access_token = access_token


class _ProfileQuery:
    def __init__(self, role: str, member_id: str | None = None) -> None:
        self.role = role
        self.member_id = member_id

    def select(self, _columns: str) -> "_ProfileQuery":
        return self

    def eq(self, _column: str, _value: str) -> "_ProfileQuery":
        return self

    def limit(self, _value: int) -> "_ProfileQuery":
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(
            data=[
                {
                    "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    "display_name": "Planner",
                    "role": self.role,
                    "active": True,
                    "member_id": self.member_id,
                }
            ]
        )


class _FakeAuth:
    def __init__(self) -> None:
        self.password_credentials: dict[str, str] | None = None
        self.refresh_token: str | None = None
        self.sign_out_options: dict[str, str] | None = None

    @staticmethod
    def _response(access_token: str, refresh_token: str) -> SimpleNamespace:
        return SimpleNamespace(
            user=SimpleNamespace(
                id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                email="planner@example.test",
            ),
            session=SimpleNamespace(
                access_token=access_token,
                refresh_token=refresh_token,
                expires_at=2_000_000_000,
            ),
        )

    def sign_in_with_password(self, credentials: dict[str, str]) -> SimpleNamespace:
        self.password_credentials = credentials
        return self._response("access-login", "refresh-login")

    def refresh_session(self, refresh_token: str) -> SimpleNamespace:
        self.refresh_token = refresh_token
        return self._response("access-rotated", "refresh-rotated")

    def sign_out(self, options: dict[str, str]) -> None:
        self.sign_out_options = options


class _FakeClient:
    def __init__(
        self,
        role: str = "planner",
        member_id: str | None = None,
    ) -> None:
        self.auth = _FakeAuth()
        self.postgrest = _Postgrest()
        self.role = role
        self.member_id = member_id

    def table(self, table_name: str) -> _ProfileQuery:
        assert table_name == "profiles"
        return _ProfileQuery(self.role, self.member_id)


def _config() -> SupabaseConfig:
    return SupabaseConfig(
        url="https://project.example.test",
        public_key="publishable-test-key",
        secret_key="secret-test-key",
    )


def test_existing_planner_password_login_returns_complete_session() -> None:
    created: list[tuple[str, str, _FakeClient]] = []

    def factory(url: str, key: str) -> _FakeClient:
        client = _FakeClient(role="planner")
        created.append((url, key, client))
        return client

    service = SupabaseAuthService(
        _config().public,
        client_factory=factory,  # type: ignore[arg-type]
    )

    session = service.sign_in_with_session(" Planner@Example.Test ", "secret")

    assert session.user.role == "planner"
    assert session.user.can_plan
    assert not session.user.is_admin
    assert session.access_token == "access-login"
    assert session.refresh_token == "refresh-login"
    assert session.expires_at == 2_000_000_000
    assert created[0][:2] == (
        "https://project.example.test",
        "publishable-test-key",
    )
    assert created[0][2].auth.password_credentials == {
        "email": "planner@example.test",
        "password": "secret",
    }
    assert created[0][2].postgrest.access_token == "access-login"


def test_session_restoration_rotates_both_tokens() -> None:
    client = _FakeClient(role="participant", member_id="member-participant")
    service = SupabaseAuthService(
        _config().public,
        client_factory=lambda _url, _key: client,  # type: ignore[arg-type]
    )

    session = service.restore_session("refresh-old")

    assert client.auth.refresh_token == "refresh-old"
    assert session.user.role == "participant"
    assert session.user.member_id == "member-participant"
    assert session.user.has_member_link
    assert not session.user.can_plan
    assert session.access_token == "access-rotated"
    assert session.refresh_token == "refresh-rotated"
    assert client.postgrest.access_token == "access-rotated"


def test_session_tokens_are_not_exposed_by_repr_and_expiry_is_checked() -> None:
    session = PersistentAuthSession(
        user=AuthenticatedUser("user", "u@example.test", "User", "participant"),
        access_token="access-sensitive",
        refresh_token="refresh-sensitive",
        expires_at=1_000,
    )
    rendered = repr(session)
    assert "access-sensitive" not in rendered
    assert "refresh-sensitive" not in rendered
    assert session.needs_refresh(now=950, leeway_seconds=60)
    assert not session.needs_refresh(now=900, leeway_seconds=60)


def test_cookie_password_is_separate_and_mandatory() -> None:
    with pytest.raises(ConfigurationError, match="cookie_password"):
        auth_cookie_config_from_secrets({})
    with pytest.raises(ConfigurationError, match="korter dan 32"):
        auth_cookie_config_from_secrets({"auth": {"cookie_password": "te-kort"}})

    config = auth_cookie_config_from_secrets(
        {"auth": {"cookie_password": "x" * 32}}
    )
    assert config.password == "x" * 32
    assert "x" * 32 not in repr(config)


def test_participant_public_config_does_not_require_or_load_secret_key() -> None:
    secrets = {
        "supabase": {
            "url": "https://project.example.test",
            "publishable_key": "publishable-test-key",
        }
    }
    public_config = public_config_from_secrets(secrets)
    assert public_config.public_key == "publishable-test-key"
    assert not hasattr(public_config, "secret_key")

    with pytest.raises(ConfigurationError, match="secret_key"):
        config_from_secrets(secrets)


def test_logout_refreshes_then_revokes_only_the_local_session() -> None:
    client = _FakeClient(role="participant")
    service = SupabaseAuthService(
        _config().public,
        client_factory=lambda _url, _key: client,  # type: ignore[arg-type]
    )

    service.sign_out_session("refresh-to-revoke")

    assert client.auth.refresh_token == "refresh-to-revoke"
    assert client.auth.sign_out_options == {"scope": "local"}


def test_admin_store_is_the_only_class_constructed_with_secret_key() -> None:
    created: list[tuple[str, str]] = []

    class _AdminClient:
        pass

    def factory(url: str, key: str) -> _AdminClient:
        created.append((url, key))
        return _AdminClient()

    # Injecteer de modulefactory alleen binnen deze test.
    import database

    original = database.create_client
    database.create_client = factory  # type: ignore[assignment]
    try:
        AdminSupabaseStore(_config())
    finally:
        database.create_client = original

    assert created == [("https://project.example.test", "secret-test-key")]


def test_admin_store_keeps_private_schedule_reads_for_planners_and_admins() -> None:
    private_schedule = {
        "id": "schedule-id",
        "players_private": [{"name": "Private Player", "ranking": 4}],
        "schedule_private": [{"court": "Court 1"}],
        "statistics_private": [{"matches": 2}],
    }

    class _ScheduleQuery:
        selected: str | None = None

        def select(self, columns: str) -> "_ScheduleQuery":
            self.selected = columns
            return self

        def eq(self, _column: str, _value: str) -> "_ScheduleQuery":
            return self

        def limit(self, _value: int) -> "_ScheduleQuery":
            return self

        def execute(self) -> SimpleNamespace:
            return SimpleNamespace(data=[private_schedule])

    query = _ScheduleQuery()

    class _AdminClient:
        def table(self, table_name: str) -> _ScheduleQuery:
            assert table_name == "schedules"
            return query

    store = object.__new__(AdminSupabaseStore)
    store.admin = _AdminClient()  # type: ignore[assignment]

    assert store.get_schedule("schedule-id") == private_schedule
    assert query.selected == "*"
