"""Tests voor callbackvalidatie, PKCE-state en participant-pendingstatus."""

import pytest

from participant_auth import (
    PARTICIPANT_STATUS_NOT_PARTICIPANT,
    PARTICIPANT_STATUS_PENDING,
    PARTICIPANT_STATUS_READY,
    OAuthPendingState,
    ParticipantAuthFlowError,
    normalize_email,
    normalize_oauth_provider,
    normalize_otp_code,
    oauth_callback_url,
    oauth_pending_cookie_name,
    oauth_redirect_base_from_secrets,
    parse_oauth_callback,
    participant_link_status,
)


VERIFIER = "v" * 43


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

    with pytest.raises(ParticipantAuthFlowError, match="verlopen"):
        OAuthPendingState.from_cookie_value(pending.to_cookie_value(), now=2_000)

    unsafe = pending.to_cookie_value().replace("vrijdag-tos", "../../planner")
    with pytest.raises(ParticipantAuthFlowError):
        OAuthPendingState.from_cookie_value(unsafe, now=1_100)


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


def test_email_and_otp_are_normalized_without_magic_link_input() -> None:
    assert normalize_email(" User@Example.Test ") == "user@example.test"
    assert normalize_otp_code("123-456") == "123456"
    with pytest.raises(ParticipantAuthFlowError):
        normalize_email("ongeldig")
    with pytest.raises(ParticipantAuthFlowError):
        normalize_otp_code("12345")


def test_participant_without_member_is_pending_and_never_planner() -> None:
    pending_profile = {
        "id": "user-a",
        "role": "participant",
        "member_id": None,
    }
    assert participant_link_status(pending_profile) == PARTICIPANT_STATUS_PENDING
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
        {"id": "member-a", "active": True},
    ) == PARTICIPANT_STATUS_READY
    assert participant_link_status(
        linked_profile,
        {"id": "member-a", "active": False},
    ) == PARTICIPANT_STATUS_PENDING
