"""Tests voor service-side registratiepreview en smalle clubdraft-update."""

from types import SimpleNamespace
from typing import Any

from database import AdminSupabaseStore


class _Query:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.calls: list[tuple[str, object]] = []

    def select(self, columns: str) -> "_Query":
        self.calls.append(("select", columns))
        return self

    def eq(self, column: str, value: object) -> "_Query":
        self.calls.append((f"eq:{column}", value))
        return self

    def in_(self, column: str, values: list[str]) -> "_Query":
        self.calls.append((f"in:{column}", values))
        return self

    def order(self, column: str, *, desc: bool = False) -> "_Query":
        self.calls.append(("order", (column, desc)))
        return self

    def update(self, payload: dict[str, Any]) -> "_Query":
        self.calls.append(("update", payload))
        self.rows = [payload]
        return self

    def insert(self, payload: dict[str, Any]) -> "_Query":
        self.calls.append(("insert", payload))
        self.rows = [payload]
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.rows)


class _AdminClient:
    def __init__(self) -> None:
        self.queries: dict[str, list[_Query]] = {}
        self.responses: dict[str, list[dict[str, Any]]] = {
            "registrations": [
                {
                    "id": "registration-a",
                    "event_id": "event-a",
                    "user_id": "user-a",
                    "member_id": "member-a",
                    "response": "attending",
                    "available_from": "2026-08-28T18:00:00+00:00",
                    "available_until": "2026-08-28T20:00:00+00:00",
                }
            ],
            "club_members": [
                {
                    "id": "member-a",
                    "display_name": "Alex",
                    "approval_status": "approved",
                    "active": True,
                }
            ],
            "member_sport_profiles": [
                {
                    "member_id": "member-a",
                    "sport": "padel",
                    "ranking": 3,
                    "active": True,
                }
            ],
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


def test_admin_import_query_enriches_only_selected_event_members() -> None:
    store, client = _store()

    rows = store.list_event_registrations_for_import("event-a")

    assert rows[0]["display_name"] == "Alex"
    assert rows[0]["approval_status"] == "approved"
    assert rows[0]["member_active"] is True
    assert rows[0]["padel_profile_active"] is True
    assert rows[0]["padel_ranking"] == 3
    assert ("eq:event_id", "event-a") in client.queries["registrations"][0].calls
    assert ("in:id", ["member-a"]) in client.queries["club_members"][0].calls
    assert (
        "in:member_id",
        ["member-a"],
    ) in client.queries["member_sport_profiles"][0].calls
    assert ("eq:sport", "padel") in client.queries["member_sport_profiles"][0].calls


def test_no_registrations_avoids_unnecessary_member_queries() -> None:
    store, client = _store()
    client.responses["registrations"] = []

    assert store.list_event_registrations_for_import("event-empty") == []
    assert set(client.queries) == {"registrations"}


def test_import_updates_only_players_with_optimistic_draft_revision() -> None:
    store, client = _store()
    players = [{"Naam": "Alex", "member_id": "member-a", "Meedoen": True}]

    saved = store.save_imported_club_draft_players(
        "planner-a",
        "Planner A",
        players,
        expected_updated_at="2026-08-18T12:00:00+00:00",
    )

    query = client.queries["club_drafts"][0]
    update_call = next(call for call in query.calls if call[0] == "update")
    assert update_call[1] == {
        "players": players,
        "updated_by": "planner-a",
        "updated_by_name": "Planner A",
    }
    assert ("eq:id", "club") in query.calls
    assert ("eq:updated_at", "2026-08-18T12:00:00+00:00") in query.calls
    assert saved["players"] == players
    assert "event_title" not in update_call[1]


def test_first_import_creates_draft_with_database_defaults() -> None:
    store, client = _store()
    players = [{"Naam": "Alex", "member_id": "member-a"}]

    saved = store.save_imported_club_draft_players(
        "planner-a",
        "Planner A",
        players,
        expected_updated_at=None,
    )

    insert_call = client.queries["club_drafts"][0].calls[0]
    assert insert_call[0] == "insert"
    assert insert_call[1]["id"] == "club"
    assert saved["players"] == players
