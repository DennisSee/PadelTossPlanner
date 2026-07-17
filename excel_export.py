"""Supabase-authenticatie en persistente opslag voor de TOS Padelplanner.

Alle databasebewerkingen lopen op de Streamlit-server via een Supabase secret/service
key. De browser krijgt deze sleutel nooit te zien.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from supabase import Client, create_client


class ConfigurationError(RuntimeError):
    """De databaseconfiguratie ontbreekt of is onvolledig."""


class AuthenticationError(RuntimeError):
    """Inloggen is mislukt of de gebruiker is niet actief."""


@dataclass(frozen=True)
class SupabaseConfig:
    url: str
    public_key: str
    secret_key: str


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str
    display_name: str
    role: str

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def config_from_secrets(secrets: Mapping[str, Any]) -> SupabaseConfig:
    """Lees Supabase-instellingen uit ``st.secrets``.

    Zowel de oudere namen (anon/service_role) als de nieuwe namen
    (publishable/secret) worden ondersteund.
    """
    try:
        section = secrets["supabase"]
    except (KeyError, TypeError) as exc:
        raise ConfigurationError(
            "Voeg een [supabase]-sectie toe aan de Streamlit Secrets."
        ) from exc

    url = str(section.get("url", "")).strip()
    public_key = str(
        section.get("publishable_key")
        or section.get("anon_key")
        or ""
    ).strip()
    secret_key = str(
        section.get("secret_key")
        or section.get("service_role_key")
        or ""
    ).strip()

    missing = []
    if not url:
        missing.append("url")
    if not public_key:
        missing.append("publishable_key/anon_key")
    if not secret_key:
        missing.append("secret_key/service_role_key")
    if missing:
        raise ConfigurationError(
            "Ontbrekende Supabase Secrets: " + ", ".join(missing)
        )

    return SupabaseConfig(url=url, public_key=public_key, secret_key=secret_key)


def _response_data(response: Any) -> list[dict[str, Any]]:
    data = getattr(response, "data", None)
    if not data:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    return []


class SupabaseStore:
    """Server-side repository voor accounts, conceptinvoer en schema's."""

    def __init__(self, config: SupabaseConfig) -> None:
        self.config = config
        self.admin: Client = create_client(config.url, config.secret_key)

    # ------------------------------------------------------------------
    # Authenticatie en profielen
    # ------------------------------------------------------------------
    def sign_in(self, email: str, password: str) -> AuthenticatedUser:
        """Controleer email/wachtwoord en laad het applicatieprofiel."""
        auth_client = create_client(self.config.url, self.config.public_key)
        try:
            response = auth_client.auth.sign_in_with_password(
                {"email": email.strip().lower(), "password": password}
            )
        except Exception as exc:  # Supabase geeft provider-specifieke exceptions terug.
            raise AuthenticationError("E-mailadres of wachtwoord is onjuist.") from exc

        user = getattr(response, "user", None)
        user_id = str(getattr(user, "id", ""))
        user_email = str(getattr(user, "email", email)).strip().lower()
        if not user_id:
            raise AuthenticationError("Inloggen is niet gelukt.")

        profile = self.get_profile(user_id)
        if not profile or not bool(profile.get("active", False)):
            raise AuthenticationError("Dit account is niet actief.")

        return AuthenticatedUser(
            id=user_id,
            email=str(profile.get("email") or user_email),
            display_name=str(profile.get("display_name") or user_email),
            role=str(profile.get("role") or "planner"),
        )

    def get_profile(self, user_id: str) -> dict[str, Any] | None:
        response = (
            self.admin.table("profiles")
            .select("id,email,display_name,role,active,created_at")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        rows = _response_data(response)
        return rows[0] if rows else None

    def list_profiles(self) -> list[dict[str, Any]]:
        response = (
            self.admin.table("profiles")
            .select("id,email,display_name,role,active,created_at")
            .order("display_name")
            .execute()
        )
        return _response_data(response)

    def create_user(
        self,
        email: str,
        password: str,
        display_name: str,
        role: str,
    ) -> dict[str, Any]:
        email = email.strip().lower()
        display_name = display_name.strip()
        if role not in {"admin", "planner"}:
            raise ValueError("Ongeldige gebruikersrol.")
        if len(password) < 8:
            raise ValueError("Het wachtwoord moet minimaal 8 tekens bevatten.")
        if not email or "@" not in email:
            raise ValueError("Vul een geldig e-mailadres in.")
        if not display_name:
            raise ValueError("Vul een weergavenaam in.")

        response = self.admin.auth.admin.create_user(
            {
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"display_name": display_name},
            }
        )
        user = getattr(response, "user", None)
        if user is None and getattr(response, "id", None):
            user = response
        user_id = str(getattr(user, "id", ""))
        if not user_id:
            raise RuntimeError("Supabase heeft geen gebruikers-ID teruggegeven.")

        try:
            profile_response = (
                self.admin.table("profiles")
                .upsert(
                    {
                        "id": user_id,
                        "email": email,
                        "display_name": display_name,
                        "role": role,
                        "active": True,
                    },
                    on_conflict="id",
                )
                .execute()
            )
            rows = _response_data(profile_response)
            return rows[0] if rows else {
                "id": user_id,
                "email": email,
                "display_name": display_name,
                "role": role,
                "active": True,
            }
        except Exception:
            # Voorkom een half aangemaakt account als het profiel niet kon worden opgeslagen.
            try:
                self.admin.auth.admin.delete_user(user_id)
            except Exception:
                pass
            raise

    def set_profile_active(self, user_id: str, active: bool) -> None:
        (
            self.admin.table("profiles")
            .update({"active": bool(active)})
            .eq("id", user_id)
            .execute()
        )

    # ------------------------------------------------------------------
    # Persoonlijke plannerinvoer
    # ------------------------------------------------------------------
    def load_draft(self, user_id: str) -> dict[str, Any] | None:
        response = (
            self.admin.table("planner_drafts")
            .select("*")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        rows = _response_data(response)
        return rows[0] if rows else None

    def save_draft(self, user_id: str, payload: Mapping[str, Any]) -> None:
        record = {"user_id": user_id, **dict(payload)}
        (
            self.admin.table("planner_drafts")
            .upsert(record, on_conflict="user_id")
            .execute()
        )

    # ------------------------------------------------------------------
    # Opgeslagen en gepubliceerde schema's
    # ------------------------------------------------------------------
    def save_schedule(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        response = self.admin.table("schedules").insert(dict(payload)).execute()
        rows = _response_data(response)
        if not rows:
            raise RuntimeError("Het schema kon niet worden opgeslagen.")
        return rows[0]

    def latest_public_schedule(self) -> dict[str, Any] | None:
        response = (
            self.admin.table("schedules")
            .select(
                "id,title,event_date,created_by_name,start_time,end_time,match_minutes,"
                "courts,participants_public,schedule_public,diagnostics,is_published,created_at"
            )
            .eq("is_published", True)
            .order("event_date", desc=True)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = _response_data(response)
        return rows[0] if rows else None

    def list_schedule_summaries(
        self,
        user_id: str,
        is_admin: bool,
    ) -> list[dict[str, Any]]:
        query = self.admin.table("schedules").select(
            "id,title,event_date,created_by,created_by_name,is_published,created_at"
        )
        if not is_admin:
            query = query.eq("created_by", user_id)
        response = query.order("event_date", desc=True).order("created_at", desc=True).execute()
        return _response_data(response)

    def get_schedule(self, schedule_id: str) -> dict[str, Any] | None:
        response = (
            self.admin.table("schedules")
            .select("*")
            .eq("id", schedule_id)
            .limit(1)
            .execute()
        )
        rows = _response_data(response)
        return rows[0] if rows else None

    def set_schedule_published(
        self,
        schedule_id: str,
        published: bool,
        user_id: str,
        is_admin: bool,
    ) -> None:
        query = self.admin.table("schedules").update(
            {"is_published": bool(published)}
        ).eq("id", schedule_id)
        if not is_admin:
            query = query.eq("created_by", user_id)
        response = query.execute()
        if not _response_data(response):
            raise PermissionError("Je mag dit schema niet aanpassen.")
