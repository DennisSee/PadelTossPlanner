"""Unit-tests voor de anonieme, minimaal bevoegde schedule-repository."""

import inspect
from types import SimpleNamespace

from public_schedule_repository import (
    PUBLIC_SCHEDULE_COLUMNS,
    PublicScheduleRepository,
)


class _ScheduleQuery:
    def __init__(self) -> None:
        self.selected: str | None = None
        self.filters: list[tuple[str, object]] = []
        self.orders: list[tuple[str, bool]] = []
        self.limit_value: int | None = None

    def select(self, columns: str) -> "_ScheduleQuery":
        self.selected = columns
        return self

    def eq(self, column: str, value: object) -> "_ScheduleQuery":
        self.filters.append((column, value))
        return self

    def order(self, column: str, *, desc: bool = False) -> "_ScheduleQuery":
        self.orders.append((column, desc))
        return self

    def limit(self, value: int) -> "_ScheduleQuery":
        self.limit_value = value
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=[{"id": "public-schedule"}])


class _PublicClient:
    def __init__(self) -> None:
        self.query = _ScheduleQuery()

    def table(self, table_name: str) -> _ScheduleQuery:
        assert table_name == "schedules"
        return self.query


def test_public_repository_uses_only_publishable_configuration() -> None:
    created: list[tuple[str, str]] = []
    client = _PublicClient()

    def factory(url: str, key: str) -> _PublicClient:
        created.append((url, key))
        return client

    repository = PublicScheduleRepository(
        "https://project.example.test",
        "publishable-test-key",
        client_factory=factory,  # type: ignore[arg-type]
    )

    assert created == [
        ("https://project.example.test", "publishable-test-key")
    ]
    assert "secret" not in inspect.signature(PublicScheduleRepository).parameters
    assert "service" not in inspect.signature(PublicScheduleRepository).parameters
    assert not hasattr(client, "auth")

    assert repository.latest_published_schedule() == {"id": "public-schedule"}


def test_public_repository_selects_only_explicit_public_columns() -> None:
    client = _PublicClient()
    repository = PublicScheduleRepository(
        "https://project.example.test",
        "publishable-test-key",
        client_factory=lambda _url, _key: client,  # type: ignore[arg-type]
    )

    repository.latest_published_schedule()

    assert "*" not in PUBLIC_SCHEDULE_COLUMNS
    assert client.query.selected == PUBLIC_SCHEDULE_COLUMNS
    assert set(PUBLIC_SCHEDULE_COLUMNS.split(",")) == {
        "id",
        "event_date",
        "created_by_name",
        "start_time",
        "end_time",
        "courts",
        "participants_public",
        "schedule_public",
        "is_published",
        "created_at",
    }
    assert client.query.filters == [("is_published", True)]
    assert client.query.orders == [("event_date", True), ("created_at", True)]
    assert client.query.limit_value == 1
