"""User-scoped repository voor onboarding en de eigen TOS-aanmelding."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable
from uuid import UUID

from supabase import Client, create_client

from authorization import is_valid_event_slug
from database import PersistentAuthSession


def _first_row(response: Any) -> dict[str, Any] | None:
    data = getattr(response, "data", None)
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data[0]
    if isinstance(data, dict):
        return data
    return None


class UserScopedRegistrationRepository:
    """Nieuwe client per gebruiker; PostgREST ontvangt diens access-token.

    De constructor accepteert bewust geen secret/service key. De Auth-service is
    verantwoordelijk voor refresh-tokenrotatie voordat deze repository wordt gemaakt.
    """

    def __init__(
        self,
        supabase_url: str,
        publishable_key: str,
        session: PersistentAuthSession,
        *,
        client_factory: Callable[[str, str], Client] = create_client,
    ) -> None:
        if not supabase_url.strip() or not publishable_key.strip():
            raise ValueError("Supabase URL en publishable key zijn verplicht.")
        if not session.user.id or not session.access_token:
            raise ValueError("Een geldige user-scoped Supabase-sessie is verplicht.")

        self._user_id = session.user.id
        self._client = client_factory(supabase_url, publishable_key)
        # Alleen deze per-user PostgREST-client ontvangt het JWT. Hierdoor worden
        # authenticated en auth.uid() door Supabase/RLS bepaald.
        self._client.postgrest.auth(session.access_token)

    def get_own_profile(self) -> dict[str, Any] | None:
        response = (
            self._client.table("profiles")
            .select("id,display_name,role,active,member_id")
            .eq("id", self._user_id)
            .limit(1)
            .execute()
        )
        return _first_row(response)

    def get_linked_club_member(self) -> dict[str, Any] | None:
        profile = self.get_own_profile()
        member_id = str((profile or {}).get("member_id") or "")
        if not member_id:
            return None

        response = (
            self._client.table("club_members")
            .select("id,display_name,approval_status,active")
            .eq("id", member_id)
            .limit(1)
            .execute()
        )
        return _first_row(response)

    def self_onboard_member(self, display_name: str) -> dict[str, Any]:
        """Roep de narrowly scoped auth.uid()-gebonden onboarding-RPC aan."""
        normalized_name = str(display_name or "").strip()
        if not 1 <= len(normalized_name) <= 120:
            raise ValueError("De weergavenaam moet tussen 1 en 120 tekens bevatten.")

        response = self._client.rpc(
            "self_onboard_member",
            {"p_display_name": normalized_name},
        ).execute()
        member = _first_row(response)
        if member is None:
            raise RuntimeError("Self-onboarding leverde geen clublidstatus op.")
        return member

    def get_open_event_by_slug(self, event_slug: str) -> dict[str, Any] | None:
        slug = str(event_slug or "").strip()
        if not is_valid_event_slug(slug):
            raise ValueError("Ongeldige TOS-eventslug.")

        response = (
            self._client.table("tos_events")
            .select("id,slug,title,sport,starts_at,ends_at,signup_deadline,status")
            .eq("slug", slug)
            .eq("status", "open")
            .limit(1)
            .execute()
        )
        return _first_row(response)

    def get_own_registration(self, event_id: str) -> dict[str, Any] | None:
        normalized_event_id = str(UUID(str(event_id)))
        response = (
            self._client.table("registrations")
            .select(
                "id,event_id,response,available_from,available_until,created_at,updated_at"
            )
            .eq("event_id", normalized_event_id)
            .eq("user_id", self._user_id)
            .limit(1)
            .execute()
        )
        return _first_row(response)

    def create_own_registration(
        self,
        event_id: str,
        response: str,
        available_from: datetime | None,
        available_until: datetime | None,
    ) -> dict[str, Any]:
        payload = self._registration_payload(
            response,
            available_from,
            available_until,
        )
        payload["event_id"] = str(UUID(str(event_id)))
        result = self._client.table("registrations").insert(payload).execute()
        registration = _first_row(result)
        if registration is None:
            raise RuntimeError("De aanmelding kon niet worden teruggelezen.")
        return registration

    def update_own_registration(
        self,
        registration_id: str,
        response: str,
        available_from: datetime | None,
        available_until: datetime | None,
    ) -> dict[str, Any]:
        payload = self._registration_payload(
            response,
            available_from,
            available_until,
        )
        result = (
            self._client.table("registrations")
            .update(payload)
            .eq("id", str(UUID(str(registration_id))))
            .eq("user_id", self._user_id)
            .execute()
        )
        registration = _first_row(result)
        if registration is None:
            raise RuntimeError("De eigen aanmelding kon niet worden gewijzigd.")
        return registration

    def save_own_registration(
        self,
        event_id: str,
        response: str,
        available_from: datetime | None,
        available_until: datetime | None,
        *,
        registration_id: str | None = None,
    ) -> dict[str, Any]:
        if registration_id:
            return self.update_own_registration(
                registration_id,
                response,
                available_from,
                available_until,
            )
        return self.create_own_registration(
            event_id,
            response,
            available_from,
            available_until,
        )

    @staticmethod
    def _registration_payload(
        response: str,
        available_from: datetime | None,
        available_until: datetime | None,
    ) -> dict[str, Any]:
        if response not in {"attending", "declined"}:
            raise ValueError("Ongeldige aanmeldkeuze.")
        if response == "declined":
            available_from = None
            available_until = None
        elif (available_from is None) != (available_until is None):
            raise ValueError("Vul zowel Vanaf als Tot in.")

        payload: dict[str, Any] = {
            "response": response,
            "available_from": UserScopedRegistrationRepository._timestamp_value(
                available_from
            ),
            "available_until": UserScopedRegistrationRepository._timestamp_value(
                available_until
            ),
        }
        return payload

    @staticmethod
    def _timestamp_value(value: datetime | None) -> str | None:
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Beschikbaarheid moet een tijdzone bevatten.")
        return value.isoformat()
