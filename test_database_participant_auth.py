"""Gesimuleerde Supabase Auth-tests voor generieke OAuth/PKCE en e-mail-OTP."""

from types import SimpleNamespace
from typing import Any

import pytest

from database import (
    AuthenticationError,
    PublicSupabaseConfig,
    SupabaseAuthService,
)
from participant_auth import oauth_callback_url


class _Postgrest:
    def __init__(self) -> None:
        self.access_token: str | None = None

    def auth(self, access_token: str) -> None:
        self.access_token = access_token


class _ProfileQuery:
    def select(self, _columns: str) -> "_ProfileQuery":
        return self

    def eq(self, _column: str, _value: str) -> "_ProfileQuery":
        return self

    def limit(self, _value: int) -> "_ProfileQuery":
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(
            data=[
                {
                    "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    "display_name": "Participant",
                    "role": "participant",
                    "active": True,
                    "member_id": None,
                }
            ]
        )


class _B2Auth:
    def __init__(self, options: Any, verifier: str, *, fail_verify: bool) -> None:
        self.options = options
        self.verifier = verifier
        self.fail_verify = fail_verify
        self.oauth_credentials: dict[str, Any] | None = None
        self.exchange_params: dict[str, str] | None = None
        self.otp_credentials: dict[str, Any] | None = None
        self.verify_params: dict[str, str] | None = None

    @staticmethod
    def _response() -> SimpleNamespace:
        return SimpleNamespace(
            user=SimpleNamespace(
                id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                email="participant@example.test",
            ),
            session=SimpleNamespace(
                access_token="participant-access-token",
                refresh_token="participant-refresh-token",
                expires_at=2_000_000_000,
            ),
        )

    def sign_in_with_oauth(self, credentials: dict[str, Any]) -> SimpleNamespace:
        self.oauth_credentials = credentials
        assert self.options is not None
        self.options.storage.set_item(
            "sb-test-auth-token-code-verifier",
            self.verifier,
        )
        provider = credentials["provider"]
        return SimpleNamespace(
            url=(
                "https://project.example.test/auth/v1/authorize?"
                f"provider={provider}&code_challenge=public-challenge"
            )
        )

    def exchange_code_for_session(
        self,
        params: dict[str, str],
    ) -> SimpleNamespace:
        self.exchange_params = params
        return self._response()

    def sign_in_with_otp(self, credentials: dict[str, Any]) -> SimpleNamespace:
        self.otp_credentials = credentials
        return SimpleNamespace()

    def verify_otp(self, params: dict[str, str]) -> SimpleNamespace:
        self.verify_params = params
        if self.fail_verify:
            raise RuntimeError(f"provider diagnostic included code {params['token']}")
        return self._response()


class _B2Client:
    def __init__(self, options: Any, verifier: str, *, fail_verify: bool) -> None:
        self.auth = _B2Auth(options, verifier, fail_verify=fail_verify)
        self.postgrest = _Postgrest()

    def table(self, table_name: str) -> _ProfileQuery:
        assert table_name == "profiles"
        return _ProfileQuery()


class _ClientFactory:
    def __init__(self) -> None:
        self.clients: list[_B2Client] = []
        self.calls: list[tuple[str, str, Any]] = []
        self.fail_verify = False

    def __call__(
        self,
        url: str,
        key: str,
        options: Any = None,
    ) -> _B2Client:
        verifier_character = chr(ord("a") + len(self.clients))
        client = _B2Client(
            options,
            verifier_character * 43,
            fail_verify=self.fail_verify,
        )
        self.clients.append(client)
        self.calls.append((url, key, options))
        return client


def _service(factory: _ClientFactory) -> SupabaseAuthService:
    return SupabaseAuthService(
        PublicSupabaseConfig(
            url="https://project.example.test",
            public_key="publishable-test-key",
        ),
        client_factory=factory,  # type: ignore[arg-type]
    )


@pytest.mark.parametrize("provider", ["google", "apple"])
def test_google_and_apple_share_one_pkce_start_flow(provider: str) -> None:
    factory = _ClientFactory()
    service = _service(factory)
    callback_url = oauth_callback_url("https://app.example/", provider)

    authorization = service.start_oauth(provider, callback_url)

    client = factory.clients[0]
    assert factory.calls[0][:2] == (
        "https://project.example.test",
        "publishable-test-key",
    )
    assert factory.calls[0][2].flow_type == "pkce"
    assert factory.calls[0][2].persist_session is False
    assert client.auth.oauth_credentials == {
        "provider": provider,
        "options": {"redirect_to": callback_url},
    }
    assert authorization.provider == provider
    assert authorization.code_verifier == "a" * 43
    assert authorization.code_verifier not in repr(authorization)
    assert "publishable-test-key" not in authorization.authorization_url


def test_oauth_callback_exchange_returns_the_existing_b1_session_shape() -> None:
    factory = _ClientFactory()
    service = _service(factory)
    callback_url = oauth_callback_url("https://app.example/", "google")

    session = service.complete_oauth(
        "auth-code-123456",
        "v" * 43,
        callback_url,
        "google",
    )

    client = factory.clients[0]
    assert client.auth.exchange_params == {
        "auth_code": "auth-code-123456",
        "code_verifier": "v" * 43,
        "redirect_to": callback_url,
    }
    assert session.user.role == "participant"
    assert not session.user.can_plan
    assert session.access_token == "participant-access-token"
    assert session.refresh_token == "participant-refresh-token"
    assert client.postgrest.access_token == "participant-access-token"
    assert "participant-access-token" not in repr(session)
    assert "participant-refresh-token" not in repr(session)


def test_invalid_oauth_callback_is_rejected_before_any_client_is_created() -> None:
    factory = _ClientFactory()
    service = _service(factory)

    with pytest.raises(AuthenticationError):
        service.complete_oauth(
            "code met spaties",
            "v" * 43,
            oauth_callback_url("https://app.example/", "google"),
            "google",
        )
    assert factory.clients == []


def test_email_otp_request_and_verification_use_publishable_clients() -> None:
    factory = _ClientFactory()
    service = _service(factory)

    normalized_email = service.request_email_otp(" Participant@Example.Test ")
    session = service.verify_email_otp(normalized_email, "123-456")

    assert normalized_email == "participant@example.test"
    assert factory.clients[0].auth.otp_credentials == {
        "email": "participant@example.test",
        "options": {"should_create_user": True},
    }
    assert factory.clients[1].auth.verify_params == {
        "email": "participant@example.test",
        "token": "123456",
        "type": "email",
    }
    assert all(call[1] == "publishable-test-key" for call in factory.calls)
    assert session.user.role == "participant"
    assert factory.clients[1].postgrest.access_token == "participant-access-token"


def test_wrong_otp_is_generic_and_never_leaks_the_code() -> None:
    factory = _ClientFactory()
    factory.fail_verify = True
    service = _service(factory)
    sensitive_code = "654321"

    with pytest.raises(AuthenticationError) as error:
        service.verify_email_otp("participant@example.test", sensitive_code)

    assert sensitive_code not in str(error.value)
    assert sensitive_code not in repr(error.value)


def test_oauth_attempts_use_isolated_clients_and_pkce_storage() -> None:
    factory = _ClientFactory()
    service = _service(factory)

    google = service.start_oauth(
        "google",
        oauth_callback_url("https://app.example/", "google"),
    )
    apple = service.start_oauth(
        "apple",
        oauth_callback_url("https://app.example/", "apple"),
    )

    assert factory.clients[0] is not factory.clients[1]
    assert factory.calls[0][2].storage is not factory.calls[1][2].storage
    assert google.code_verifier != apple.code_verifier
