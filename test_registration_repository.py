"""Tests voor geïsoleerde user-scoped Supabase/PostgREST-clients."""

from types import SimpleNamespace
from typing import Any

from database import AuthenticatedUser, PersistentAuthSession
from registration_repository import (
    PUBLIC_SIGNUP_EVENT_COLUMNS,
    PublicSignupEventRepository,
    UserScopedRegistrationRepository,
)


class _Query:
    def __init__(self, response_data: object) -> None:
        self.response_data = response_data
        self.calls: list[tuple[str, object]] = []

    def select(self, columns: str) -> "_Query":
        self.calls.append(("select", columns))
        return self

    def eq(self, column: str, value: object) -> "_Query":
        self.calls.append((f"eq:{column}", value))
        return self

    def limit(self, value: int) -> "_Query":
        self.calls.append(("limit", value))
        return self

    def insert(self, payload: dict[str, object]) -> "_Query":
        self.calls.append(("insert", payload))
        return self

    def update(self, payload: dict[str, object]) -> "_Query":
        self.calls.append(("update", payload))
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.response_data)


class _Postgrest:
    def __init__(self) -> None:
        self.access_token: str | None = None

    def auth(self, token: str) -> None:
        self.access_token = token


class _UserClient:
    def __init__(self, responses: dict[str, object] | None = None) -> None:
        self.postgrest = _Postgrest()
        self.responses = responses or {}
        self.queries: dict[str, _Query] = {}
        self.rpc_calls: list[tuple[str, dict[str, object]]] = []

    def table(self, table_name: str) -> _Query:
        query = _Query(self.responses.get(table_name, []))
        self.queries[table_name] = query
        return query

    def rpc(self, function_name: str, params: dict[str, object]) -> _Query:
        self.rpc_calls.append((function_name, params))
        return _Query(self.responses.get(f"rpc:{function_name}", []))


def _session(user_id: str, access_token: str) -> PersistentAuthSession:
    return PersistentAuthSession(
        user=AuthenticatedUser(
            user_id,
            f"{user_id}@example.test",
            user_id,
            "participant",
        ),
        access_token=access_token,
        refresh_token=f"refresh-{user_id}",
        expires_at=2_000_000_000,
    )


def test_repository_uses_publishable_key_and_user_access_token_only() -> None:
    created: list[tuple[str, str, _UserClient]] = []

    def factory(url: str, key: str) -> _UserClient:
        client = _UserClient()
        created.append((url, key, client))
        return client

    UserScopedRegistrationRepository(
        "https://project.example.test",
        "publishable-test-key",
        _session("user-a", "access-a"),
        client_factory=factory,  # type: ignore[arg-type]
    )

    assert created[0][:2] == (
        "https://project.example.test",
        "publishable-test-key",
    )
    assert created[0][2].postgrest.access_token == "access-a"


def test_public_signup_event_uses_publishable_key_rls_and_explicit_columns() -> None:
    client = _UserClient(
        {
            "tos_events": [
                {
                    "id": "10000000-0000-4000-8000-000000000001",
                    "slug": "vrijdag-tos",
                    "title": "Padel TOS",
                    "sport": "padel",
                }
            ]
        }
    )
    created: list[tuple[str, str]] = []

    def factory(url: str, key: str) -> _UserClient:
        created.append((url, key))
        return client

    repository = PublicSignupEventRepository(
        "https://project.example.test",
        "publishable-test-key",
        client_factory=factory,  # type: ignore[arg-type]
    )

    event = repository.get_open_event_by_slug("vrijdag-tos")

    assert event is not None
    assert event["slug"] == "vrijdag-tos"
    assert created == [
        ("https://project.example.test", "publishable-test-key")
    ]
    assert client.postgrest.access_token is None
    calls = client.queries["tos_events"].calls
    assert ("select", PUBLIC_SIGNUP_EVENT_COLUMNS) in calls
    assert "*" not in PUBLIC_SIGNUP_EVENT_COLUMNS
    assert ("eq:slug", "vrijdag-tos") in calls
    assert ("eq:status", "open") in calls


def test_two_users_never_share_one_global_client_or_session() -> None:
    clients: list[_UserClient] = []

    def factory(_url: str, _key: str) -> _UserClient:
        client = _UserClient()
        clients.append(client)
        return client

    repo_a = UserScopedRegistrationRepository(
        "https://project.example.test",
        "publishable-test-key",
        _session("user-a", "access-a"),
        client_factory=factory,  # type: ignore[arg-type]
    )
    repo_b = UserScopedRegistrationRepository(
        "https://project.example.test",
        "publishable-test-key",
        _session("user-b", "access-b"),
        client_factory=factory,  # type: ignore[arg-type]
    )

    assert repo_a is not repo_b
    assert clients[0] is not clients[1]
    assert clients[0].postgrest.access_token == "access-a"
    assert clients[1].postgrest.access_token == "access-b"


def test_read_methods_filter_to_current_user_and_safe_public_fields() -> None:
    user_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    member_id = "11111111-1111-4111-8111-111111111111"
    event_id = "10000000-0000-4000-8000-000000000001"
    client = _UserClient(
        {
            "profiles": [{"id": user_id, "member_id": member_id}],
            "club_members": [
                {
                    "id": member_id,
                    "display_name": "Lid A",
                    "approval_status": "approved",
                    "active": True,
                }
            ],
            "tos_events": [
                {"id": event_id, "slug": "vrijdag-tos", "sport": "padel"}
            ],
            "registrations": [
                {
                    "id": "20000000-0000-4000-8000-000000000001",
                    "event_id": event_id,
                    "response": "attending",
                }
            ],
        }
    )
    repository = UserScopedRegistrationRepository(
        "https://project.example.test",
        "publishable-test-key",
        _session(user_id, "access-a"),
        client_factory=lambda _url, _key: client,  # type: ignore[arg-type]
    )

    assert repository.get_own_profile() == {"id": user_id, "member_id": member_id}
    assert repository.get_linked_club_member() == {
        "id": member_id,
        "display_name": "Lid A",
        "approval_status": "approved",
        "active": True,
    }
    assert repository.get_open_event_by_slug("vrijdag-tos") == {
        "id": event_id,
        "slug": "vrijdag-tos",
        "sport": "padel",
    }
    assert repository.get_own_registration(event_id) == {
        "id": "20000000-0000-4000-8000-000000000001",
        "event_id": event_id,
        "response": "attending",
    }
    assert ("eq:user_id", user_id) in client.queries["registrations"].calls
    assert ("eq:status", "open") in client.queries["tos_events"].calls


def test_self_onboarding_uses_only_the_user_scoped_rpc() -> None:
    user_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    member_id = "11111111-1111-4111-8111-111111111111"
    client = _UserClient(
        {
            "rpc:self_onboard_member": [
                {
                    "member_id": member_id,
                    "display_name": "Lid A",
                    "approval_status": "approved",
                    "active": True,
                }
            ]
        }
    )
    repository = UserScopedRegistrationRepository(
        "https://project.example.test",
        "publishable-test-key",
        _session(user_id, "access-a"),
        client_factory=lambda _url, _key: client,  # type: ignore[arg-type]
    )

    result = repository.self_onboard_member("  Lid A  ")

    assert result["approval_status"] == "approved"
    assert client.rpc_calls == [
        ("self_onboard_member", {"p_display_name": "Lid A"})
    ]
    assert client.queries == {}


def test_create_and_update_send_only_self_service_registration_fields() -> None:
    from datetime import datetime, timezone

    user_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    event_id = "10000000-0000-4000-8000-000000000001"
    registration_id = "20000000-0000-4000-8000-000000000001"
    client = _UserClient(
        {
            "registrations": [
                {
                    "id": registration_id,
                    "event_id": event_id,
                    "response": "attending",
                }
            ]
        }
    )
    repository = UserScopedRegistrationRepository(
        "https://project.example.test",
        "publishable-test-key",
        _session(user_id, "access-a"),
        client_factory=lambda _url, _key: client,  # type: ignore[arg-type]
    )
    available_from = datetime(2099, 8, 1, 18, 30, tzinfo=timezone.utc)
    available_until = datetime(2099, 8, 1, 20, 0, tzinfo=timezone.utc)

    repository.create_own_registration(
        event_id,
        "attending",
        available_from,
        available_until,
    )
    insert_payload = dict(client.queries["registrations"].calls)["insert"]
    assert set(insert_payload) == {
        "event_id",
        "response",
        "available_from",
        "available_until",
    }
    assert not {"user_id", "member_id", "source"} & set(insert_payload)

    repository.update_own_registration(
        registration_id,
        "declined",
        available_from,
        available_until,
    )
    update_query = client.queries["registrations"]
    update_payload = dict(update_query.calls)["update"]
    assert update_payload == {
        "response": "declined",
        "available_from": None,
        "available_until": None,
    }
    assert ("eq:id", registration_id) in update_query.calls
    assert ("eq:user_id", user_id) in update_query.calls


def test_save_dispatches_between_create_and_own_update() -> None:
    user_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    event_id = "10000000-0000-4000-8000-000000000001"
    registration_id = "20000000-0000-4000-8000-000000000001"
    client = _UserClient(
        {
            "registrations": [
                {
                    "id": registration_id,
                    "event_id": event_id,
                    "response": "attending",
                }
            ]
        }
    )
    repository = UserScopedRegistrationRepository(
        "https://project.example.test",
        "publishable-test-key",
        _session(user_id, "access-a"),
        client_factory=lambda _url, _key: client,  # type: ignore[arg-type]
    )

    repository.save_own_registration(event_id, "attending", None, None)
    assert (
        "insert",
        {
            "event_id": event_id,
            "response": "attending",
            "available_from": None,
            "available_until": None,
        },
    ) in client.queries["registrations"].calls

    repository.save_own_registration(
        event_id,
        "declined",
        None,
        None,
        registration_id=registration_id,
    )
    assert ("eq:id", registration_id) in client.queries["registrations"].calls
