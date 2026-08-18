"""Tests voor expliciet bevoorrecht leden-, approval- en rankingbeheer."""

from types import SimpleNamespace
from typing import Any

import pytest

from database import AdminSupabaseStore
from member_management import MemberManagementError, is_ready_for_padel_tos


class _Query:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.calls: list[tuple[str, object]] = []

    def select(self, columns: str) -> "_Query":
        self.calls.append(("select", columns))
        return self

    def order(self, column: str, *, desc: bool = False) -> "_Query":
        self.calls.append(("order", (column, desc)))
        return self

    def eq(self, column: str, value: object) -> "_Query":
        self.calls.append((f"eq:{column}", value))
        return self

    def limit(self, value: int) -> "_Query":
        self.calls.append(("limit", value))
        return self

    def update(self, payload: dict[str, Any]) -> "_Query":
        self.calls.append(("update", payload))
        self.rows = [payload]
        return self

    def upsert(self, payload: dict[str, Any], *, on_conflict: str) -> "_Query":
        self.calls.append(("upsert", (payload, on_conflict)))
        self.rows = [payload]
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.rows)


class _AdminClient:
    def __init__(self) -> None:
        self.queries: dict[str, list[_Query]] = {}
        self.responses: dict[str, list[dict[str, Any]]] = {
            "club_members": [
                {
                    "id": "member-a",
                    "display_name": "Alex",
                    "approval_status": "approved",
                    "active": True,
                },
                {
                    "id": "member-b",
                    "display_name": "Bo",
                    "approval_status": "pending",
                    "active": True,
                },
            ],
            "profiles": [
                {
                    "id": "user-a",
                    "email": "alex@example.test",
                    "display_name": "Alex",
                    "role": "participant",
                    "active": True,
                    "member_id": "member-a",
                }
            ],
            "member_sport_profiles": [
                {
                    "member_id": "member-a",
                    "sport": "padel",
                    "ranking": 3,
                    "active": True,
                },
                {
                    "member_id": "member-a",
                    "sport": "tennis",
                    "ranking": 5,
                    "active": True,
                },
            ],
            "club_settings": [{"require_member_approval": False}],
        }

    def table(self, table_name: str) -> _Query:
        query = _Query([dict(row) for row in self.responses.get(table_name, [])])
        self.queries.setdefault(table_name, []).append(query)
        return query


def _store() -> tuple[AdminSupabaseStore, _AdminClient]:
    client = _AdminClient()
    store = object.__new__(AdminSupabaseStore)
    store.admin = client  # type: ignore[assignment]
    return store, client


def test_member_list_combines_account_and_independent_sport_profiles() -> None:
    store, client = _store()

    members = store.list_club_members()

    assert members[0]["linked_profile"]["id"] == "user-a"
    assert members[0]["padel_profile"]["ranking"] == 3
    assert members[0]["tennis_profile"]["ranking"] == 5
    assert is_ready_for_padel_tos(members[0])
    assert members[1]["linked_profile"] is None
    assert not is_ready_for_padel_tos(members[1])
    assert client.queries["club_members"][0].calls[0] == (
        "select",
        "id,display_name,approval_status,active,created_at,updated_at",
    )


def test_approval_setting_update_is_narrow_and_does_not_touch_members() -> None:
    store, client = _store()

    assert store.get_member_approval_setting() is False
    store.set_require_member_approval(True)

    setting_calls = client.queries["club_settings"][-1].calls
    assert ("update", {"require_member_approval": True}) in setting_calls
    assert ("eq:id", "club") in setting_calls
    assert "club_members" not in client.queries


def test_approval_transitions_and_member_active_are_separate_updates() -> None:
    store, client = _store()

    store.set_member_approval("member-b", "pending", "approved")
    store.set_member_active("member-b", False)

    approval_calls = client.queries["club_members"][0].calls
    active_calls = client.queries["club_members"][1].calls
    assert ("update", {"approval_status": "approved"}) in approval_calls
    assert ("eq:approval_status", "pending") in approval_calls
    assert ("update", {"active": False}) in active_calls


def test_invalid_approval_transition_is_rejected_before_database_write() -> None:
    store, client = _store()

    with pytest.raises(MemberManagementError, match="approved naar pending"):
        store.set_member_approval("member-a", "approved", "pending")

    assert client.queries == {}


def test_padel_and_tennis_rankings_are_upserted_independently() -> None:
    store, client = _store()

    padel = store.upsert_member_sport_profile("member-a", "padel", 2, True)
    tennis = store.upsert_member_sport_profile("member-a", "tennis", 4, False)

    assert padel["ranking"] == 2
    assert tennis == {
        "member_id": "member-a",
        "sport": "tennis",
        "ranking": 4,
        "active": False,
    }
    upserts = [query.calls[0] for query in client.queries["member_sport_profiles"]]
    assert all(call[0] == "upsert" for call in upserts)
    assert all(call[1][1] == "member_id,sport" for call in upserts)


def test_ranking_can_only_be_cleared_explicitly_with_none() -> None:
    store, client = _store()

    cleared = store.upsert_member_sport_profile("member-a", "padel", None, True)
    assert cleared["ranking"] is None

    with pytest.raises(MemberManagementError):
        store.upsert_member_sport_profile("member-a", "padel", "", True)  # type: ignore[arg-type]
    assert len(client.queries["member_sport_profiles"]) == 1
