"""Veilige, provider-onafhankelijke bouwstenen voor participant-authenticatie."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from time import time
from typing import Mapping
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from authorization import SignupReturnContext, is_valid_event_slug


SUPPORTED_OAUTH_PROVIDERS = ("google", "apple")
PARTICIPANT_STATUS_NEEDS_ONBOARDING = "needs_onboarding"
PARTICIPANT_STATUS_PENDING_APPROVAL = "pending_approval"
PARTICIPANT_STATUS_REJECTED = "rejected"
PARTICIPANT_STATUS_INACTIVE = "inactive"
PARTICIPANT_STATUS_UNAVAILABLE = "member_unavailable"
PARTICIPANT_STATUS_READY = "ready"
PARTICIPANT_STATUS_NOT_PARTICIPANT = "not_participant"
OAUTH_PENDING_MAX_AGE_SECONDS = 10 * 60
OAUTH_CALLBACK_MARKER = "auth_callback"
OAUTH_COOKIE_SYNC_MAX_RUNS = 2
EMAIL_OTP_MAX_INPUT_LENGTH = 32
OTP_CODE_USER_ERROR = (
    "De code klopt niet of is verlopen. Vraag eventueel een nieuwe code aan."
)
_EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_PKCE_VERIFIER_PATTERN = re.compile(r"^[A-Za-z0-9._~-]{43,128}$")
_AUTH_CODE_PATTERN = re.compile(r"^[A-Za-z0-9._~-]{8,2048}$")


class ParticipantAuthFlowError(ValueError):
    """De participant-authflow bevat ongeldige of verlopen invoer."""


class OAuthCookiePersistenceError(ParticipantAuthFlowError):
    """De versleutelde PKCE-cookie kon niet veilig worden opgeslagen."""


@dataclass(frozen=True)
class OAuthAuthorization:
    provider: str
    authorization_url: str
    redirect_to: str
    code_verifier: str = field(repr=False)


@dataclass(frozen=True)
class OAuthCallback:
    provider: str
    authorization_code: str = field(repr=False)


@dataclass(frozen=True)
class OAuthPendingState:
    """Versleuteld te bewaren PKCE-state voor precies één provider en event."""

    provider: str
    event_slug: str
    redirect_to: str
    created_at: int
    code_verifier: str = field(repr=False)
    authorization_url: str = field(repr=False)

    def to_cookie_value(self) -> str:
        return json.dumps(
            {
                "version": 2,
                "provider": self.provider,
                "event_slug": self.event_slug,
                "redirect_to": self.redirect_to,
                "created_at": self.created_at,
                "code_verifier": self.code_verifier,
                "authorization_url": self.authorization_url,
            },
            separators=(",", ":"),
            sort_keys=True,
        )

    @classmethod
    def from_cookie_value(
        cls,
        raw_value: object,
        *,
        now: int | None = None,
    ) -> "OAuthPendingState":
        try:
            payload = json.loads(str(raw_value or ""))
        except (TypeError, ValueError, json.JSONDecodeError):
            raise ParticipantAuthFlowError(
                "De OAuth-aanvraag ontbreekt of is ongeldig."
            ) from None

        if not isinstance(payload, dict) or payload.get("version") != 2:
            raise ParticipantAuthFlowError("De OAuth-aanvraag ontbreekt of is ongeldig.")

        provider = normalize_oauth_provider(payload.get("provider"))
        event_slug = str(payload.get("event_slug") or "")
        if not is_valid_event_slug(event_slug):
            raise ParticipantAuthFlowError("De OAuth-returnroute is ongeldig.")

        redirect_to = validate_oauth_callback_url(
            payload.get("redirect_to"),
            provider,
        )
        verifier = validate_pkce_verifier(payload.get("code_verifier"))
        authorization_url = validate_oauth_authorization_url(
            payload.get("authorization_url"),
            provider,
        )
        try:
            created_at = int(payload.get("created_at"))
        except (TypeError, ValueError):
            raise ParticipantAuthFlowError("De OAuth-aanvraag is ongeldig.") from None

        current_time = int(time()) if now is None else int(now)
        age = current_time - created_at
        if age < -60 or age > OAUTH_PENDING_MAX_AGE_SECONDS:
            raise ParticipantAuthFlowError("De OAuth-aanvraag is verlopen.")

        return cls(
            provider=provider,
            event_slug=event_slug,
            redirect_to=redirect_to,
            created_at=created_at,
            code_verifier=verifier,
            authorization_url=authorization_url,
        )

    @property
    def return_context(self) -> SignupReturnContext:
        return SignupReturnContext(event_slug=self.event_slug)


def _query_value(value: object) -> str:
    if isinstance(value, (list, tuple)):
        value = value[-1] if value else ""
    return str(value or "").strip()


def normalize_oauth_provider(provider: object) -> str:
    normalized = str(provider or "").strip().lower()
    if normalized not in SUPPORTED_OAUTH_PROVIDERS:
        raise ParticipantAuthFlowError("Deze OAuth-provider wordt niet ondersteund.")
    return normalized


def validate_pkce_verifier(value: object) -> str:
    verifier = str(value or "")
    if not _PKCE_VERIFIER_PATTERN.fullmatch(verifier):
        raise ParticipantAuthFlowError("De PKCE-verifier ontbreekt of is ongeldig.")
    return verifier


def normalize_email(value: object) -> str:
    email = str(value or "").strip().lower()
    if len(email) > 254 or not _EMAIL_PATTERN.fullmatch(email):
        raise ParticipantAuthFlowError("Vul een geldig e-mailadres in.")
    return email


def normalize_otp_code(value: object) -> str:
    """Beperk alleen het invoerformaat; Supabase bepaalt OTP-lengte/geldigheid."""
    code = str(value or "").strip()
    if (
        not code
        or len(code) > EMAIL_OTP_MAX_INPUT_LENGTH
        or not re.fullmatch(r"[0-9]+", code)
    ):
        raise ParticipantAuthFlowError("Vul alleen de cijfercode uit de e-mail in.")
    return code


def validate_oauth_authorization_code(value: object) -> str:
    code = str(value or "")
    if not _AUTH_CODE_PATTERN.fullmatch(code):
        raise ParticipantAuthFlowError("De OAuth-callback is ongeldig of onvolledig.")
    return code


def validate_oauth_authorization_url(value: object, provider: object) -> str:
    """Accepteer uitsluitend een veilige Supabase OAuth-authorize-URL."""
    raw_url = str(value or "").strip()
    parsed = urlsplit(raw_url)
    normalized_provider = normalize_oauth_provider(provider)
    query = parse_qs(parsed.query, keep_blank_values=True)
    is_loopback = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if (
        not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or not parsed.query
        or query.get("provider") != [normalized_provider]
        or not parsed.path.endswith("/auth/v1/authorize")
        or (parsed.scheme != "https" and not (parsed.scheme == "http" and is_loopback))
    ):
        raise ParticipantAuthFlowError("De OAuth-doorverwijzing is ongeldig.")
    return raw_url


def validate_oauth_redirect_base(value: object) -> str:
    raw_url = str(value or "").strip()
    parsed = urlsplit(raw_url)
    is_loopback = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if (
        not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or parsed.query
        or (parsed.scheme != "https" and not (parsed.scheme == "http" and is_loopback))
    ):
        raise ParticipantAuthFlowError(
            "auth.oauth_redirect_url moet een veilige HTTPS-URL zonder query of fragment zijn."
        )

    path = parsed.path or "/"
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def oauth_callback_url(redirect_base: object, provider: object) -> str:
    base = validate_oauth_redirect_base(redirect_base)
    normalized_provider = normalize_oauth_provider(provider)
    query = urlencode(
        {OAUTH_CALLBACK_MARKER: "1", "provider": normalized_provider}
    )
    return f"{base}?{query}"


def validate_oauth_callback_url(value: object, provider: object) -> str:
    normalized_provider = normalize_oauth_provider(provider)
    raw_url = str(value or "").strip()
    parsed = urlsplit(raw_url)
    base = validate_oauth_redirect_base(
        urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))
    )
    query = parse_qs(parsed.query, keep_blank_values=True)
    if query != {
        OAUTH_CALLBACK_MARKER: ["1"],
        "provider": [normalized_provider],
    }:
        raise ParticipantAuthFlowError("De OAuth-callback-URL is ongeldig.")
    return f"{base}?{urlencode({OAUTH_CALLBACK_MARKER: '1', 'provider': normalized_provider})}"


def parse_oauth_callback(
    query_params: Mapping[str, object],
) -> OAuthCallback | None:
    if _query_value(query_params.get(OAUTH_CALLBACK_MARKER)) != "1":
        return None

    provider = normalize_oauth_provider(_query_value(query_params.get("provider")))
    if _query_value(query_params.get("error")) or _query_value(
        query_params.get("error_description")
    ):
        raise ParticipantAuthFlowError("De externe login is geannuleerd of mislukt.")

    code = validate_oauth_authorization_code(_query_value(query_params.get("code")))
    return OAuthCallback(provider=provider, authorization_code=code)


def oauth_redirect_base_from_secrets(secrets: Mapping[str, object]) -> str:
    try:
        section = secrets["auth"]
        value = section.get("oauth_redirect_url")  # type: ignore[union-attr]
    except (AttributeError, KeyError, TypeError) as exc:
        raise ParticipantAuthFlowError(
            "Voeg auth.oauth_redirect_url toe voor Google- en Apple-login."
        ) from exc
    if not str(value or "").strip():
        raise ParticipantAuthFlowError(
            "Voeg auth.oauth_redirect_url toe voor Google- en Apple-login."
        )
    return validate_oauth_redirect_base(value)


def oauth_pending_cookie_name(provider: object) -> str:
    return f"supabase_pkce_{normalize_oauth_provider(provider)}"


def oauth_provider_label(provider: object) -> str:
    return {"google": "Google", "apple": "Apple"}[normalize_oauth_provider(provider)]


def oauth_storage_user_error(provider: object) -> str:
    label = oauth_provider_label(provider)
    return f"Inloggen met {label} lukt nu niet. Probeer het opnieuw of gebruik e-mail."


def oauth_provider_unavailable_message(provider: object | None = None) -> str:
    if provider is None:
        return (
            "Inloggen met Google of Apple is hier nog niet beschikbaar. "
            "Gebruik voorlopig e-mail."
        )
    label = oauth_provider_label(provider)
    return (
        f"Inloggen met {label} is hier nog niet beschikbaar. "
        "Gebruik voorlopig e-mail."
    )


def confirmed_oauth_pending_cookie(
    cookies: object,
    provider: object,
    event_slug: object | None,
    *,
    now: int | None = None,
) -> OAuthPendingState:
    """Lees PKCE-state pas nadat de browser de queued cookiewrite bevestigde.

    ``streamlit-cookies-manager`` voegt queued waarden toe aan ``get()``. Alleen
    het verdwijnen van de provider-key uit de interne queue bewijst daarom dat
    de versleutelde browsercookie in een vervolgrun is teruggelezen. Deze smalle
    adapter is bewust fail-closed voor een afwijkende library-implementatie.
    """
    normalized_provider = normalize_oauth_provider(provider)
    normalized_slug = None if event_slug is None else str(event_slug or "")
    if normalized_slug is not None and not is_valid_event_slug(normalized_slug):
        raise ParticipantAuthFlowError("De OAuth-returnroute is ongeldig.")

    cookie_name = oauth_pending_cookie_name(normalized_provider)
    try:
        cookie_manager = getattr(cookies, "_cookie_manager")
        queue = getattr(cookie_manager, "_queue")
        if not isinstance(queue, Mapping) or cookie_name in queue:
            raise ParticipantAuthFlowError(
                "De OAuth-aanvraag is nog niet door de browser bevestigd."
            )
        raw_value = cookies.get(cookie_name)  # type: ignore[union-attr]
    except ParticipantAuthFlowError:
        raise
    except Exception:
        raise ParticipantAuthFlowError(
            "De OAuth-aanvraag kon niet veilig worden gelezen."
        ) from None

    pending = OAuthPendingState.from_cookie_value(raw_value, now=now)
    if pending.provider != normalized_provider or (
        normalized_slug is not None and pending.event_slug != normalized_slug
    ):
        raise ParticipantAuthFlowError("De OAuth-aanvraag komt niet overeen.")
    return pending


def participant_link_status(
    profile: Mapping[str, object],
    member: Mapping[str, object] | None = None,
) -> str:
    """Bepaal zonder frontendstate of een participant veilig verder mag."""
    if str(profile.get("role") or "") != "participant":
        return PARTICIPANT_STATUS_NOT_PARTICIPANT

    member_id = str(profile.get("member_id") or "")
    if not member_id:
        return PARTICIPANT_STATUS_NEEDS_ONBOARDING
    if (
        member is None
        or str(member.get("id") or "") != member_id
    ):
        return PARTICIPANT_STATUS_UNAVAILABLE

    approval_status = str(member.get("approval_status") or "")
    if approval_status == "pending":
        return PARTICIPANT_STATUS_PENDING_APPROVAL
    if approval_status == "rejected":
        return PARTICIPANT_STATUS_REJECTED
    if approval_status != "approved":
        return PARTICIPANT_STATUS_UNAVAILABLE
    if not bool(member.get("active", False)):
        return PARTICIPANT_STATUS_INACTIVE
    return PARTICIPANT_STATUS_READY
