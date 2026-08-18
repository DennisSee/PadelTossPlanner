"""Gescheiden Supabase-authenticatie en server-side beheeropslag.

De secret/service key blijft beperkt tot :class:`AdminSupabaseStore`. Auth-sessies
gebruiken een publishable key; user-scoped RLS-verzoeken staan in een aparte repository.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from time import time
from typing import Any, Callable, Mapping

from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions

from authorization import can_access_admin, can_access_planner
from member_management import (
    validate_approval_transition,
    validate_ranking,
    validate_sport,
)
from participant_auth import (
    OAuthAuthorization,
    ParticipantAuthFlowError,
    normalize_email,
    normalize_oauth_provider,
    normalize_otp_code,
    validate_oauth_authorization_code,
    validate_oauth_callback_url,
    validate_pkce_verifier,
)


class ConfigurationError(RuntimeError):
    """De databaseconfiguratie ontbreekt of is onvolledig."""


class AuthenticationError(RuntimeError):
    """Inloggen is mislukt of de gebruiker is niet actief."""


@dataclass(frozen=True)
class SupabaseConfig:
    url: str
    public_key: str
    secret_key: str

    @property
    def public(self) -> "PublicSupabaseConfig":
        return PublicSupabaseConfig(url=self.url, public_key=self.public_key)


@dataclass(frozen=True)
class PublicSupabaseConfig:
    url: str
    public_key: str


@dataclass(frozen=True)
class AuthCookieConfig:
    password: str = field(repr=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str
    display_name: str
    role: str

    @property
    def is_admin(self) -> bool:
        return can_access_admin(self.role)

    @property
    def can_plan(self) -> bool:
        return can_access_planner(self.role)


@dataclass(frozen=True)
class PersistentAuthSession:
    """Applicatiegebruiker plus de actuele, geroteerde Supabase-tokens."""

    user: AuthenticatedUser
    access_token: str = field(repr=False)
    refresh_token: str = field(repr=False)
    expires_at: int | None = None

    def needs_refresh(
        self,
        *,
        now: float | None = None,
        leeway_seconds: int = 60,
    ) -> bool:
        if self.expires_at is None:
            return True
        current_time = time() if now is None else now
        return self.expires_at <= current_time + leeway_seconds


def public_config_from_secrets(
    secrets: Mapping[str, Any],
) -> PublicSupabaseConfig:
    """Lees uitsluitend de publieke Supabase-instellingen uit ``st.secrets``."""
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
    missing = []
    if not url:
        missing.append("url")
    if not public_key:
        missing.append("publishable_key/anon_key")
    if missing:
        raise ConfigurationError(
            "Ontbrekende Supabase Secrets: " + ", ".join(missing)
        )

    return PublicSupabaseConfig(url=url, public_key=public_key)


def config_from_secrets(secrets: Mapping[str, Any]) -> SupabaseConfig:
    """Lees publieke én bevoorrechte instellingen voor planner/adminfuncties."""
    public_config = public_config_from_secrets(secrets)
    section = secrets["supabase"]
    secret_key = str(
        section.get("secret_key")
        or section.get("service_role_key")
        or ""
    ).strip()
    if not secret_key:
        raise ConfigurationError(
            "Ontbrekende Supabase Secrets: secret_key/service_role_key"
        )
    return SupabaseConfig(
        url=public_config.url,
        public_key=public_config.public_key,
        secret_key=secret_key,
    )


def auth_cookie_config_from_secrets(
    secrets: Mapping[str, Any],
) -> AuthCookieConfig:
    """Lees de afzonderlijke verplichte encryptiesleutel voor login-cookies."""
    try:
        section = secrets["auth"]
    except (KeyError, TypeError) as exc:
        raise ConfigurationError(
            "Voeg een [auth]-sectie met cookie_password toe aan Streamlit Secrets."
        ) from exc

    password = str(section.get("cookie_password") or "").strip()
    if len(password) < 32:
        raise ConfigurationError(
            "auth.cookie_password ontbreekt of is korter dan 32 tekens."
        )
    return AuthCookieConfig(password=password)


def _response_data(response: Any) -> list[dict[str, Any]]:
    data = getattr(response, "data", None)
    if not data:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    return []


def _session_expiry(auth_session: Any) -> int | None:
    raw_expiry = getattr(auth_session, "expires_at", None)
    if raw_expiry is None:
        return None
    try:
        return int(raw_expiry)
    except (TypeError, ValueError):
        return None


class AdminSupabaseStore:
    """Expliciet bevoorrechte repository voor planner- en adminfuncties."""

    def __init__(self, config: SupabaseConfig) -> None:
        self.config = config
        self.admin: Client = create_client(config.url, config.secret_key)

    # ------------------------------------------------------------------
    # Bevoorrechte profielen en accounts
    # ------------------------------------------------------------------
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
    # Bevoorrecht leden-, approval- en rankingbeheer
    # ------------------------------------------------------------------
    def list_club_members(self) -> list[dict[str, Any]]:
        """Combineer clubidentiteit, accountkoppeling en sportprofielen voor beheer."""
        members = _response_data(
            self.admin.table("club_members")
            .select(
                "id,display_name,approval_status,active,created_at,updated_at"
            )
            .order("display_name")
            .execute()
        )
        profiles = _response_data(
            self.admin.table("profiles")
            .select("id,email,display_name,role,active,member_id")
            .execute()
        )
        sport_profiles = _response_data(
            self.admin.table("member_sport_profiles")
            .select("member_id,sport,ranking,active,created_at,updated_at")
            .execute()
        )

        profiles_by_member = {
            str(profile["member_id"]): profile
            for profile in profiles
            if profile.get("member_id")
        }
        sports_by_member: dict[str, dict[str, dict[str, Any]]] = {}
        for sport_profile in sport_profiles:
            member_id = str(sport_profile.get("member_id") or "")
            sport = str(sport_profile.get("sport") or "")
            if member_id and sport in {"padel", "tennis"}:
                sports_by_member.setdefault(member_id, {})[sport] = sport_profile

        result: list[dict[str, Any]] = []
        for member in members:
            member_id = str(member.get("id") or "")
            linked_profile = profiles_by_member.get(member_id)
            member_sports = sports_by_member.get(member_id, {})
            result.append(
                {
                    **member,
                    "linked_profile": linked_profile,
                    "padel_profile": member_sports.get("padel"),
                    "tennis_profile": member_sports.get("tennis"),
                }
            )
        return result

    def get_member_approval_setting(self) -> bool:
        response = (
            self.admin.table("club_settings")
            .select("require_member_approval")
            .eq("id", "club")
            .limit(1)
            .execute()
        )
        rows = _response_data(response)
        if not rows:
            raise RuntimeError("De clubinstelling voor approval ontbreekt.")
        return bool(rows[0].get("require_member_approval"))

    def set_require_member_approval(self, required: bool) -> None:
        response = (
            self.admin.table("club_settings")
            .update({"require_member_approval": bool(required)})
            .eq("id", "club")
            .execute()
        )
        if not _response_data(response):
            raise RuntimeError("De approval-instelling kon niet worden aangepast.")

    def set_member_active(self, member_id: str, active: bool) -> None:
        if not str(member_id or "").strip():
            raise ValueError("Een member-id is vereist.")
        response = (
            self.admin.table("club_members")
            .update({"active": bool(active)})
            .eq("id", member_id)
            .execute()
        )
        if not _response_data(response):
            raise RuntimeError("De lidstatus kon niet worden aangepast.")

    def set_member_approval(
        self,
        member_id: str,
        current_status: str,
        target_status: str,
    ) -> None:
        if not str(member_id or "").strip():
            raise ValueError("Een member-id is vereist.")
        normalized_target = validate_approval_transition(current_status, target_status)
        response = (
            self.admin.table("club_members")
            .update({"approval_status": normalized_target})
            .eq("id", member_id)
            .eq("approval_status", current_status)
            .execute()
        )
        if not _response_data(response):
            raise RuntimeError(
                "De approval-status is intussen gewijzigd; laad de pagina opnieuw."
            )

    def upsert_member_sport_profile(
        self,
        member_id: str,
        sport: str,
        ranking: int | None,
        active: bool,
    ) -> dict[str, Any]:
        if not str(member_id or "").strip():
            raise ValueError("Een member-id is vereist.")
        record = {
            "member_id": member_id,
            "sport": validate_sport(sport),
            "ranking": validate_ranking(ranking),
            "active": bool(active),
        }
        response = (
            self.admin.table("member_sport_profiles")
            .upsert(record, on_conflict="member_id,sport")
            .execute()
        )
        rows = _response_data(response)
        if not rows:
            raise RuntimeError("Het sportprofiel kon niet worden opgeslagen.")
        return rows[0]

    # ------------------------------------------------------------------
    # TOS-eventbeheer voor planners en beheerders
    # ------------------------------------------------------------------
    def list_tos_events(self) -> list[dict[str, Any]]:
        response = (
            self.admin.table("tos_events")
            .select(
                "id,slug,title,sport,starts_at,ends_at,signup_deadline,status,"
                "created_by,created_at,updated_at"
            )
            .order("starts_at", desc=True)
            .execute()
        )
        events = _response_data(response)
        registration_response = (
            self.admin.table("registrations").select("event_id").execute()
        )
        registration_counts: dict[str, int] = {}
        for registration in _response_data(registration_response):
            event_id = str(registration.get("event_id") or "")
            if event_id:
                registration_counts[event_id] = registration_counts.get(event_id, 0) + 1
        return [
            {
                **event,
                "registration_count": registration_counts.get(
                    str(event.get("id") or ""),
                    0,
                ),
            }
            for event in events
        ]

    def get_tos_event(self, event_id: str) -> dict[str, Any] | None:
        response = (
            self.admin.table("tos_events")
            .select(
                "id,slug,title,sport,starts_at,ends_at,signup_deadline,status,"
                "created_by,created_at,updated_at"
            )
            .eq("id", event_id)
            .limit(1)
            .execute()
        )
        rows = _response_data(response)
        return rows[0] if rows else None

    def create_tos_event(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        allowed_fields = {
            "slug",
            "title",
            "sport",
            "starts_at",
            "ends_at",
            "signup_deadline",
            "status",
            "created_by",
        }
        record = dict(payload)
        if set(record) != allowed_fields:
            raise ValueError("Het nieuwe event bevat ongeldige of ontbrekende velden.")
        response = self.admin.table("tos_events").insert(record).execute()
        rows = _response_data(response)
        if not rows:
            raise RuntimeError("Het TOS-event kon niet worden aangemaakt.")
        return rows[0]

    def update_tos_event(
        self,
        event_id: str,
        payload: Mapping[str, Any],
    ) -> dict[str, Any]:
        record = dict(payload)
        if not record or not set(record).issubset({"title", "signup_deadline"}):
            raise ValueError(
                "Na creatie zijn alleen titel en inschrijfdeadline wijzigbaar."
            )
        response = (
            self.admin.table("tos_events")
            .update(record)
            .eq("id", event_id)
            .execute()
        )
        rows = _response_data(response)
        if not rows:
            raise RuntimeError("Het TOS-event kon niet worden gewijzigd.")
        return rows[0]

    def set_tos_event_status(self, event_id: str, status: str) -> dict[str, Any]:
        if status not in {"draft", "open", "closed", "cancelled"}:
            raise ValueError("De eventstatus is ongeldig.")
        response = (
            self.admin.table("tos_events")
            .update({"status": status})
            .eq("id", event_id)
            .execute()
        )
        rows = _response_data(response)
        if not rows:
            raise RuntimeError("De eventstatus kon niet worden gewijzigd.")
        return rows[0]

    # ------------------------------------------------------------------
    # Gedeelde clubinvoer
    # ------------------------------------------------------------------
    def load_club_draft(self) -> dict[str, Any] | None:
        """Laad de gedeelde invoer die voor alle planners hetzelfde is."""
        response = (
            self.admin.table("club_drafts")
            .select("*")
            .eq("id", "club")
            .limit(1)
            .execute()
        )
        rows = _response_data(response)
        return rows[0] if rows else None

    def save_club_draft(
        self,
        user_id: str,
        display_name: str,
        payload: Mapping[str, Any],
    ) -> dict[str, Any]:
        """Sla de invoer centraal op; de laatst opgeslagen versie is leidend."""
        record = {
            "id": "club",
            **dict(payload),
            "updated_by": user_id,
            "updated_by_name": display_name,
        }
        response = (
            self.admin.table("club_drafts")
            .upsert(record, on_conflict="id")
            .execute()
        )
        rows = _response_data(response)
        return rows[0] if rows else record

    # Oude persoonlijke concepten blijven beschikbaar voor compatibiliteit.
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

    def list_schedule_summaries(
        self,
        user_id: str,
        is_admin: bool,
    ) -> list[dict[str, Any]]:
        """Geef alle clubschema's terug aan iedere ingelogde planner.

        ``user_id`` en ``is_admin`` blijven onderdeel van de signatuur zodat oudere
        aanroepen compatibel blijven. Wijzigingen aan een schema worden afzonderlijk
        beveiligd in ``set_schedule_published``: alleen de maker of een beheerder mag
        de publicatiestatus aanpassen.
        """
        del user_id, is_admin
        response = (
            self.admin.table("schedules")
            .select(
                "id,title,event_date,created_by,created_by_name,is_published,created_at"
            )
            .order("event_date", desc=True)
            .order("created_at", desc=True)
            .execute()
        )
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


class SupabaseAuthService:
    """Stateless Auth-service die uitsluitend de publishable key gebruikt."""

    def __init__(
        self,
        config: PublicSupabaseConfig,
        *,
        client_factory: Callable[[str, str], Client] = create_client,
    ) -> None:
        self.config = config
        self._client_factory = client_factory

    def _public_client(self) -> Client:
        return self._client_factory(self.config.url, self.config.public_key)

    def _pkce_client(self, storage: Any) -> Client:
        options = SyncClientOptions(
            auto_refresh_token=False,
            persist_session=False,
            flow_type="pkce",
            storage=storage,
        )
        return self._client_factory(
            self.config.url,
            self.config.public_key,
            options,
        )

    def _persistent_session_from_response(
        self,
        response: Any,
        auth_client: Client,
        *,
        fallback_email: str = "",
    ) -> PersistentAuthSession:
        """Valideer een Auth-response en laad het applicatieprofiel."""
        auth_user = getattr(response, "user", None)
        auth_session = getattr(response, "session", None)

        user_id = str(getattr(auth_user, "id", "") or "")
        user_email = str(
            getattr(auth_user, "email", fallback_email) or fallback_email
        ).strip().lower()
        access_token = str(getattr(auth_session, "access_token", "") or "")
        refresh_token = str(getattr(auth_session, "refresh_token", "") or "")

        if not user_id or not access_token or not refresh_token:
            raise AuthenticationError("De gebruikerssessie kon niet worden geladen.")

        # Bind ook profielresolutie aan het JWT. De profiles_select_own-policy
        # bepaalt hierdoor dat uitsluitend het eigen profiel zichtbaar is.
        auth_client.postgrest.auth(access_token)
        profile_response = (
            auth_client.table("profiles")
            .select("id,display_name,role,active,member_id")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        profile_rows = _response_data(profile_response)
        profile = profile_rows[0] if profile_rows else None
        if not profile or not bool(profile.get("active", False)):
            raise AuthenticationError("Dit account is niet actief.")

        role = str(profile.get("role") or "participant")
        if role not in {"participant", "planner", "admin"}:
            raise AuthenticationError("Dit account heeft een ongeldige applicatierol.")

        return PersistentAuthSession(
            user=AuthenticatedUser(
                id=user_id,
                email=user_email,
                display_name=str(profile.get("display_name") or user_email),
                role=role,
            ),
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=_session_expiry(auth_session),
        )

    def sign_in_with_session(
        self,
        email: str,
        password: str,
    ) -> PersistentAuthSession:
        """Behoud de bestaande e-mail/wachtwoordlogin en retourneer beide tokens."""
        normalized_email = email.strip().lower()
        auth_client = self._public_client()
        try:
            response = auth_client.auth.sign_in_with_password(
                {"email": normalized_email, "password": password}
            )
        except Exception:
            raise AuthenticationError("E-mailadres of wachtwoord is onjuist.") from None

        return self._persistent_session_from_response(
            response,
            auth_client,
            fallback_email=normalized_email,
        )

    def sign_in(self, email: str, password: str) -> AuthenticatedUser:
        return self.sign_in_with_session(email, password).user

    def start_oauth(
        self,
        provider: str,
        redirect_to: str,
    ) -> OAuthAuthorization:
        """Maak een Google/Apple authorize-URL en geef de geheime verifier apart terug."""
        try:
            normalized_provider = normalize_oauth_provider(provider)
            callback_url = validate_oauth_callback_url(
                redirect_to,
                normalized_provider,
            )
        except ParticipantAuthFlowError as exc:
            raise AuthenticationError(str(exc)) from None

        storage = _PkceCaptureStorage()
        auth_client = self._pkce_client(storage)
        try:
            response = auth_client.auth.sign_in_with_oauth(
                {
                    "provider": normalized_provider,
                    "options": {"redirect_to": callback_url},
                }
            )
            authorization_url = str(getattr(response, "url", "") or "")
            verifier = validate_pkce_verifier(storage.code_verifier())
        except Exception:
            raise AuthenticationError(
                f"Inloggen met {normalized_provider.title()} kon niet worden gestart."
            ) from None

        expected_prefix = f"{self.config.url.rstrip('/')}/auth/v1/authorize?"
        if not authorization_url.startswith(expected_prefix):
            raise AuthenticationError("De OAuth-authorisatie-URL is ongeldig.")

        return OAuthAuthorization(
            provider=normalized_provider,
            authorization_url=authorization_url,
            redirect_to=callback_url,
            code_verifier=verifier,
        )

    def complete_oauth(
        self,
        authorization_code: str,
        code_verifier: str,
        redirect_to: str,
        provider: str,
    ) -> PersistentAuthSession:
        """Wissel een eenmalige PKCE-code om voor de bestaande B1-sessie."""
        try:
            normalized_provider = normalize_oauth_provider(provider)
            callback_url = validate_oauth_callback_url(
                redirect_to,
                normalized_provider,
            )
            verifier = validate_pkce_verifier(code_verifier)
            code = validate_oauth_authorization_code(authorization_code)
        except ParticipantAuthFlowError as exc:
            raise AuthenticationError(str(exc)) from None

        auth_client = self._pkce_client(_PkceCaptureStorage())
        try:
            response = auth_client.auth.exchange_code_for_session(
                {
                    "auth_code": code,
                    "code_verifier": verifier,
                    "redirect_to": callback_url,
                }
            )
            return self._persistent_session_from_response(response, auth_client)
        except AuthenticationError:
            raise
        except Exception:
            raise AuthenticationError(
                "De externe login kon niet veilig worden afgerond."
            ) from None

    def request_email_otp(self, email: str) -> str:
        """Vraag uitsluitend een e-mailcode aan; de UI verwerkt geen Magic Link."""
        try:
            normalized_email = normalize_email(email)
        except ParticipantAuthFlowError as exc:
            raise AuthenticationError(str(exc)) from None

        auth_client = self._public_client()
        try:
            auth_client.auth.sign_in_with_otp(
                {
                    "email": normalized_email,
                    "options": {"should_create_user": True},
                }
            )
        except Exception:
            raise AuthenticationError(
                "De eenmalige e-mailcode kon niet worden verstuurd."
            ) from None
        return normalized_email

    def verify_email_otp(
        self,
        email: str,
        code: str,
    ) -> PersistentAuthSession:
        """Verifieer de OTP-code en lever dezelfde B1-sessie als OAuth/password."""
        try:
            normalized_email = normalize_email(email)
            normalized_code = normalize_otp_code(code)
        except ParticipantAuthFlowError as exc:
            raise AuthenticationError(str(exc)) from None

        auth_client = self._public_client()
        try:
            response = auth_client.auth.verify_otp(
                {
                    "email": normalized_email,
                    "token": normalized_code,
                    "type": "email",
                }
            )
            return self._persistent_session_from_response(
                response,
                auth_client,
                fallback_email=normalized_email,
            )
        except AuthenticationError:
            raise
        except Exception:
            raise AuthenticationError(
                "De eenmalige e-mailcode is onjuist of verlopen."
            ) from None

    def restore_session(self, refresh_token: str) -> PersistentAuthSession:
        """Roteer het refresh-token en retourneer de actuele access-token."""
        token = str(refresh_token or "").strip()
        if not token:
            raise AuthenticationError("De opgeslagen sessie ontbreekt.")

        auth_client = self._public_client()
        try:
            response = auth_client.auth.refresh_session(token)
        except Exception:
            raise AuthenticationError(
                "De opgeslagen sessie is verlopen of ongeldig."
            ) from None
        return self._persistent_session_from_response(response, auth_client)

    def sign_out_session(self, refresh_token: str) -> None:
        """Beëindig alleen de actuele Supabase-sessie op dit apparaat."""
        token = str(refresh_token or "").strip()
        if not token:
            return

        auth_client = self._public_client()
        auth_client.auth.refresh_session(token)
        auth_client.auth.sign_out({"scope": "local"})


class _PkceCaptureStorage:
    """Per-aanroepgeheugen dat alleen dient om de gegenereerde verifier af te vangen."""

    def __init__(self) -> None:
        self._values: dict[str, str] = {}

    def get_item(self, key: str) -> str | None:
        return self._values.get(key)

    def set_item(self, key: str, value: str) -> None:
        self._values[key] = value

    def remove_item(self, key: str) -> None:
        self._values.pop(key, None)

    def code_verifier(self) -> str:
        verifiers = [
            value
            for key, value in self._values.items()
            if key.endswith("-code-verifier")
        ]
        if len(verifiers) != 1:
            raise AuthenticationError("De PKCE-verifier kon niet worden aangemaakt.")
        return verifiers[0]
