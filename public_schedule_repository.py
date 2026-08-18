"""Minimaal bevoegde repository voor reeds gepubliceerde openbare schema's."""

from __future__ import annotations

from typing import Any, Callable

from supabase import Client, create_client


PUBLIC_SCHEDULE_COLUMNS = (
    "id,event_date,created_by_name,start_time,end_time,courts,"
    "participants_public,schedule_public,is_published,created_at"
)


def _first_row(response: Any) -> dict[str, Any] | None:
    data = getattr(response, "data", None)
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data[0]
    if isinstance(data, dict):
        return data
    return None


class PublicScheduleRepository:
    """Lees openbare schema's met uitsluitend URL en publishable key.

    Deze repository accepteert bewust geen gebruikerssessie, access-token of
    secret/service key. Database-RLS en kolomgrants vormen de primaire begrenzing.
    """

    def __init__(
        self,
        supabase_url: str,
        publishable_key: str,
        *,
        client_factory: Callable[[str, str], Client] = create_client,
    ) -> None:
        if not supabase_url.strip() or not publishable_key.strip():
            raise ValueError("Supabase URL en publishable key zijn verplicht.")
        self._client = client_factory(supabase_url, publishable_key)

    def latest_published_schedule(self) -> dict[str, Any] | None:
        response = (
            self._client.table("schedules")
            .select(PUBLIC_SCHEDULE_COLUMNS)
            .eq("is_published", True)
            .order("event_date", desc=True)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return _first_row(response)
