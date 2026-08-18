"""Tests voor callbackvalidatie, PKCE-state en participant-pendingstatus."""

from types import SimpleNamespace

import pytest

from participant_auth import (
    PARTICIPANT_STATUS_INACTIVE,
    PARTICIPANT_STATUS_NEEDS_ONBOARDING,
    PARTICIPANT_STATUS_NOT_PARTICIPANT,
    PARTICIPANT_STATUS_PENDING_APPROVAL,
    PARTICIPANT_STATUS_READY,
    PARTICIPANT_STATUS_REJECTED,
    PARTICIPANT_STATUS_UNAVAILABLE,
    OAuthPendingState,
    ParticipantAuthFlowError,
    confirmed_oauth_pending_cookie,
    normalize_email,
    normalize_oauth_provider,
    normalize_otp_code,
    oauth_callback_url,
    oauth_pending_cookie_name,
    oauth_provider_unavailable_message,
    oauth_redirect_base_from_secrets,
    oauth_storage_user_error,
    parse_oauth_callback,
    participant_link_status,
)


VERIFIER = "v" * 43
AUTHORIZE_URL = (
    "https://project.example.test/auth/v1/authorize?provider=google&state=sensitive-state"
)


class _EncryptedCookies(dict[str, str]):
    def __init__(
        self,
        values: dict[str, str],
        queued: set[str] | None = None,
    ) -> None:
        super().__init__(values)
        self._cookie_manager = SimpleNamespace(
            _queue={name: {"value": "encrypted"} for name in (queued or set())}
        )


@pytest.mark.parametrize("provider", ["google", "apple"])
def test_google_and_apple_use_the_same_validated_callback_shape(provider: str) -> None:
    assert normalize_oauth_provider(provider.upper()) == provider
    assert oauth_callback_url("https://app.example/", provider) == (
        f"https://app.example/?auth_callback=1&provider={provider}"
    )
    assert oauth_pending_cookie_name(provider) == f"supabase_pkce_{provider}"

    callback = parse_oauth_callback(
        {
            "auth_callback": "1",
            "provider": provider,
            "code": "auth-code-123456",
        }
    )
    assert callback is not None
    assert callback.provider == provider
    assert callback.authorization_code == "auth-code-123456"


def test_invalid_or_failed_oauth_callback_fails_without_exposing_provider_text() -> None:
    assert parse_oauth_callback({"page": "signup", "event": "vrijdag-tos"}) is None

    with pytest.raises(ParticipantAuthFlowError):
        parse_oauth_callback(
            {
                "auth_callback": "1",
                "provider": "facebook",
                "code": "auth-code-123456",
            }
        )

    sensitive_description = "provider-secret-diagnostic"
    with pytest.raises(ParticipantAuthFlowError) as error:
        parse_oauth_callback(
            {
                "auth_callback": "1",
                "provider": "google",
                "error": "access_denied",
                "error_description": sensitive_description,
            }
        )
    assert sensitive_description not in str(error.value)

    with pytest.raises(ParticipantAuthFlowError):
        parse_oauth_callback(
            {
                "auth_callback": "1",
                "provider": "apple",
                "code": "code met spaties",
            }
        )


def test_pending_pkce_state_restores_only_validated_internal_signup_context() -> None:
    pending = OAuthPendingState(
        provider="google",
        event_slug="vrijdag-tos",
        redirect_to="https://app.example/?auth_callback=1&provider=google",
        created_at=1_000,
        code_verifier=VERIFIER,
        authorization_url=AUTHORIZE_URL,
    )
    restored = OAuthPendingState.from_cookie_value(
        pending.to_cookie_value(),
        now=1_100,
    )

    assert restored.return_context.event_slug == "vrijdag-tos"
    assert restored.return_context.query_params == {
        "page": "signup",
        "event": "vrijdag-tos",
    }
    assert VERIFIER not in repr(restored)
    assert "sensitive-state" not in repr(restored)

    with pytest.raises(ParticipantAuthFlowError, match="verlopen"):
        OAuthPendingState.from_cookie_value(pending.to_cookie_value(), now=2_000)

    unsafe = pending.to_cookie_value().replace("vrijdag-tos", "../../planner")
    with pytest.raises(ParticipantAuthFlowError):
        OAuthPendingState.from_cookie_value(unsafe, now=1_100)


def test_pkce_cookie_must_be_confirmed_by_browser_before_oauth_redirect() -> None:
    pending = OAuthPendingState(
        provider="google",
        event_slug="vrijdag-tos",
        redirect_to="https://app.example/?auth_callback=1&provider=google",
        created_at=1_000,
        code_verifier=VERIFIER,
        authorization_url=AUTHORIZE_URL,
    )
    cookie_name = oauth_pending_cookie_name("google")
    cookies = _EncryptedCookies(
        {
            "supabase_refresh_token": "existing-refresh-token",
            cookie_name: pending.to_cookie_value(),
        },
        queued={cookie_name},
    )

    with pytest.raises(ParticipantAuthFlowError, match="browser bevestigd"):
        confirmed_oauth_pending_cookie(
            cookies,
            "google",
            "vrijdag-tos",
            now=1_100,
        )

    cookies._cookie_manager._queue.clear()
    confirmed = confirmed_oauth_pending_cookie(
        cookies,
        "google",
        "vrijdag-tos",
        now=1_100,
    )
    assert confirmed.authorization_url == AUTHORIZE_URL
    assert cookies["supabase_refresh_token"] == "existing-refresh-token"
    assert confirmed_oauth_pending_cookie(
        cookies,
        "google",
        None,
        now=1_100,
    ).return_context.event_slug == "vrijdag-tos"


def test_provider_cookies_are_separate_and_malformed_or_expired_state_fails() -> None:
    google = OAuthPendingState(
        provider="google",
        event_slug="vrijdag-tos",
        redirect_to="https://app.example/?auth_callback=1&provider=google",
        created_at=1_000,
        code_verifier="g" * 43,
        authorization_url=AUTHORIZE_URL,
    )
    apple = OAuthPendingState(
        provider="apple",
        event_slug="vrijdag-tos",
        redirect_to="https://app.example/?auth_callback=1&provider=apple",
        created_at=1_000,
        code_verifier="a" * 43,
        authorization_url=(
            "https://project.example.test/auth/v1/authorize?"
            "provider=apple&state=apple-sensitive-state"
        ),
    )
    cookies = _EncryptedCookies(
        {
            oauth_pending_cookie_name("google"): google.to_cookie_value(),
            oauth_pending_cookie_name("apple"): apple.to_cookie_value(),
        }
    )

    assert confirmed_oauth_pending_cookie(
        cookies, "google", "vrijdag-tos", now=1_100
    ).provider == "google"
    assert confirmed_oauth_pending_cookie(
        cookies, "apple", "vrijdag-tos", now=1_100
    ).provider == "apple"

    cookies[oauth_pending_cookie_name("google")] = "malformed"
    with pytest.raises(ParticipantAuthFlowError):
        confirmed_oauth_pending_cookie(
            cookies, "google", "vrijdag-tos", now=1_100
        )
    with pytest.raises(ParticipantAuthFlowError, match="verlopen"):
        confirmed_oauth_pending_cookie(
            _EncryptedCookies(
                {oauth_pending_cookie_name("apple"): apple.to_cookie_value()}
            ),
            "apple",
            "vrijdag-tos",
            now=2_000,
        )


def test_participant_auth_user_errors_are_short_and_never_expose_details() -> None:
    assert oauth_storage_user_error("google") == (
        "Inloggen met Google lukt nu niet. Probeer het opnieuw of gebruik e-mail."
    )
    assert "oauth_redirect_url" not in oauth_provider_unavailable_message()


def test_redirect_configuration_allows_https_and_local_loopback_only() -> None:
    assert oauth_redirect_base_from_secrets(
        {"auth": {"oauth_redirect_url": "https://app.example/signup"}}
    ) == "https://app.example/signup"
    assert oauth_redirect_base_from_secrets(
        {"auth": {"oauth_redirect_url": "http://127.0.0.1:8501/"}}
    ) == "http://127.0.0.1:8501/"

    for unsafe in (
        "http://app.example/",
        "https://user:password@app.example/",
        "https://app.example/?next=https://evil.example",
        "https://app.example/#fragment",
    ):
        with pytest.raises(ParticipantAuthFlowError):
            oauth_redirect_base_from_secrets(
                {"auth": {"oauth_redirect_url": unsafe}}
            )


def test_email_otp_accepts_numeric_codes_without_owning_supabase_length() -> None:
    assert normalize_email(" User@Example.Test ") == "user@example.test"
    assert normalize_otp_code("12345678") == "12345678"
    assert normalize_otp_code("123456") == "123456"
    assert normalize_otp_code("1234") == "1234"
    with pytest.raises(ParticipantAuthFlowError):
        normalize_email("ongeldig")
    with pytest.raises(ParticipantAuthFlowError):
        normalize_otp_code("1234-5678")
    with pytest.raises(ParticipantAuthFlowError):
        normalize_otp_code("code1234")


def test_participant_link_status_distinguishes_onboarding_and_approval() -> None:
    new_profile = {
        "id": "user-a",
        "role": "participant",
        "member_id": None,
    }
    assert participant_link_status(new_profile) == PARTICIPANT_STATUS_NEEDS_ONBOARDING
    assert participant_link_status({"role": "planner"}) == (
        PARTICIPANT_STATUS_NOT_PARTICIPANT
    )
    assert participant_link_status({"role": "admin"}) == (
        PARTICIPANT_STATUS_NOT_PARTICIPANT
    )

    linked_profile = {
        "role": "participant",
        "member_id": "member-a",
    }
    assert participant_link_status(
        linked_profile,
        {"id": "member-a", "approval_status": "approved", "active": True},
    ) == PARTICIPANT_STATUS_READY
    assert participant_link_status(
        linked_profile,
        {"id": "member-a", "approval_status": "approved", "active": False},
    ) == PARTICIPANT_STATUS_INACTIVE
    assert participant_link_status(
        linked_profile,
        {"id": "member-a", "approval_status": "pending", "active": True},
    ) == PARTICIPANT_STATUS_PENDING_APPROVAL
    assert participant_link_status(
        linked_profile,
        {"id": "member-a", "approval_status": "rejected", "active": True},
    ) == PARTICIPANT_STATUS_REJECTED
    assert participant_link_status(linked_profile, None) == PARTICIPANT_STATUS_UNAVAILABLE
    assert participant_link_status(
        linked_profile,
        {"id": "member-b", "approval_status": "approved", "active": True},
    ) == PARTICIPANT_STATUS_UNAVAILABLE
