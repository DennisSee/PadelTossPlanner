"""Tests voor service-side TOS-eventbeheer en registratieaantallen."""

from types import SimpleNamespace
from typing import Any

import pytest

from database import AdminSupabaseStore


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

    def insert(self, payload: dict[str, Any]) -> "_Query":
        self.calls.append(("insert", payload))
        self.rows = [payload]
        return self

    def update(self, payload: dict[str, Any]) -> "_Query":
        self.calls.append(("update", payload))
        self.rows = [payload]
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.rows)


class _AdminClient:
    def __init__(self) -> None:
        self.queries: dict[str, list[_Query]] = {}
        self.responses = {
            "tos_events": [
                {
                    "id": "event-a",
                    "slug": "padel-tos-20990828-abc12345",
                    "sport": "padel",
                    "status": "open",
                }
            ],
            "registrations": [
                {"event_id": "event-a"},
                {"event_id": "event-a"},
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


def _new_event(sport: str) -> dict[str, Any]:
    return {
        "slug": f"{sport}-tos-20990828-abc12345",
        "title": "TOS-avond",
        "sport": sport,
        "starts_at": "2099-08-28T18:00:00+00:00",
        "ends_at": "2099-08-28T20:00:00+00:00",
        "signup_deadline": None,
        "status": "draft",
        "created_by": "planner-a",
    }


@pytest.mark.parametrize("sport", ["padel", "tennis"])
def test_admin_store_creates_padel_and_tennis_events(sport: str) -> None:
    store, client = _store()
    record = _new_event(sport)

    assert store.create_tos_event(record) == record
    assert ("insert", record) in client.queries["tos_events"][-1].calls


def test_event_list_contains_only_safe_counts_not_registration_data() -> None:
    store, client = _store()

    events = store.list_tos_events()

    assert events[0]["registration_count"] == 2
    registration_select = client.queries["registrations"][0].calls[0]
    assert registration_select == ("select", "event_id")


def test_structural_event_updates_are_rejected_after_creation() -> None:
    store, client = _store()

    with pytest.raises(ValueError, match="alleen titel"):
        store.update_tos_event("event-a", {"sport": "tennis"})
    with pytest.raises(ValueError, match="alleen titel"):
        store.update_tos_event(
            "event-a",
            {"starts_at": "2099-08-28T18:30:00+00:00"},
        )
    assert client.queries == {}


def test_title_deadline_and_all_statuses_remain_manageable() -> None:
    store, client = _store()
    update = {"title": "Nieuwe titel", "signup_deadline": None}

    assert store.update_tos_event("event-a", update) == update
    for status in ("draft", "open", "closed", "cancelled"):
        assert store.set_tos_event_status("event-a", status) == {"status": status}

    all_updates = [
        call
        for query in client.queries["tos_events"]
        for call in query.calls
        if call[0] == "update"
    ]
    assert ("update", update) in all_updates
    assert ("update", {"status": "cancelled"}) in all_updates
