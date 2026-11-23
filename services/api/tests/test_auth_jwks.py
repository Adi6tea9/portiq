"""B11: the real JWKS path, verified over HTTP instead of a monkeypatched client.

``tests/test_auth.py`` swaps ``security.jwks_client`` for a stub so the JWT rules can be
tested fast. That leaves one thing unproven: that ``PyJWKClient`` actually fetches and
caches a key set from ``SUPABASE_JWT_JWKS_URL`` and that a real RS256 signature verifies.
These tests serve a real JWKS document from a loopback HTTP server and send real tokens.
"""

from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from jwt.algorithms import RSAAlgorithm

from app.core import security
from app.core.config import settings
from app.core.errors import AppError

ISSUER = "https://local-jwks.test/auth/v1"
AUDIENCE = "authenticated"
JWKS_PATH = "/auth/v1/.well-known/jwks.json"
KID = "b11-test-key"


class _JwksHandler(BaseHTTPRequestHandler):
    """Serves one static JWKS document and counts how often it was fetched."""

    jwks: dict[str, Any] = {}
    requests = 0

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler naming
        if self.path != JWKS_PATH:
            self.send_error(404)
            return
        type(self).requests += 1
        body = json.dumps(self.jwks).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: Any) -> None:
        """Keep pytest output clean."""


@pytest.fixture(scope="module")
def jwks_server() -> Iterator[tuple[str, RSAPrivateKey]]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk: dict[str, Any] = json.loads(RSAAlgorithm.to_jwk(private_key.public_key()))
    jwk.update({"kid": KID, "alg": "RS256", "use": "sig"})
    _JwksHandler.jwks = {"keys": [jwk]}
    _JwksHandler.requests = 0

    server = ThreadingHTTPServer(("127.0.0.1", 0), _JwksHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}{JWKS_PATH}", private_key
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


@pytest.fixture
def supabase_jwks(
    monkeypatch: pytest.MonkeyPatch, jwks_server: tuple[str, RSAPrivateKey]
) -> RSAPrivateKey:
    """Point security at the loopback JWKS and clear the process-wide client cache."""
    url, private_key = jwks_server
    monkeypatch.setattr(
        security,
        "settings",
        replace(
            settings,
            auth_mode="supabase",
            supabase_jwt_jwks_url=url,
            supabase_jwt_issuer=ISSUER,
            supabase_jwt_audience=AUDIENCE,
        ),
    )
    monkeypatch.setattr(security, "_jwks_client", None)
    monkeypatch.setattr(security, "_jwks_client_url", None)
    return private_key


def _claims(**overrides: object) -> dict[str, object]:
    now = datetime.now(UTC)
    claims: dict[str, object] = {
        "sub": str(uuid4()),
        "email": "jwks@portiq.demo",
        "aud": AUDIENCE,
        "iss": ISSUER,
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
    claims.update(overrides)
    return claims


def _token(private_key: RSAPrivateKey, claims: dict[str, object], kid: str = KID) -> str:
    return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": kid})


def _rejected(token: str) -> AppError:
    with pytest.raises(AppError) as excinfo:
        security.resolve_identity(token)
    assert (excinfo.value.status_code, excinfo.value.code) == (401, "UNAUTHENTICATED")
    return excinfo.value


def test_real_jwks_fetch_verifies_a_signed_token(supabase_jwks: RSAPrivateKey) -> None:
    user_id = uuid4()
    token = _token(supabase_jwks, _claims(sub=str(user_id), email="real.jwks@portiq.demo"))

    identity = security.resolve_identity(token)

    assert isinstance(identity, security.SupabaseIdentity)
    assert identity.user_id == user_id
    assert identity.email == "real.jwks@portiq.demo"
    assert _JwksHandler.requests == 1


def test_key_set_is_cached_across_requests(supabase_jwks: RSAPrivateKey) -> None:
    before = _JwksHandler.requests

    for _ in range(3):
        security.resolve_identity(_token(supabase_jwks, _claims()))

    # The fixture clears the cached client, so the first call fetches once and the
    # next two reuse that key set inside the 300 s lifespan.
    assert _JwksHandler.requests - before == 1


def test_valid_signature_from_another_key_is_rejected(supabase_jwks: RSAPrivateKey) -> None:
    impostor = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    _rejected(_token(impostor, _claims()))


def test_unknown_kid_is_rejected(supabase_jwks: RSAPrivateKey) -> None:
    _rejected(_token(supabase_jwks, _claims(), kid="kid-that-is-not-published"))


def test_expired_token_is_rejected(supabase_jwks: RSAPrivateKey) -> None:
    expired = datetime.now(UTC) - timedelta(minutes=5)

    _rejected(_token(supabase_jwks, _claims(exp=expired)))


def test_unreachable_jwks_url_is_a_401_not_a_500(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A dead JWKS endpoint must fail closed with the contract's error, never a stack trace."""
    monkeypatch.setattr(
        security,
        "settings",
        replace(
            settings,
            auth_mode="supabase",
            supabase_jwt_jwks_url="http://127.0.0.1:1/auth/v1/.well-known/jwks.json",
            supabase_jwt_issuer=ISSUER,
            supabase_jwt_audience=AUDIENCE,
        ),
    )
    monkeypatch.setattr(security, "_jwks_client", None)
    monkeypatch.setattr(security, "_jwks_client_url", None)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    _rejected(_token(key, _claims()))


def test_token_issued_a_few_seconds_ahead_is_accepted(supabase_jwks: RSAPrivateKey) -> None:
    ahead = datetime.now(UTC) + timedelta(seconds=10)
    identity = security.resolve_identity(_token(supabase_jwks, _claims(iat=ahead, nbf=ahead)))
    assert isinstance(identity, security.SupabaseIdentity)


def test_token_issued_far_in_the_future_is_rejected(supabase_jwks: RSAPrivateKey) -> None:
    ahead = datetime.now(UTC) + timedelta(minutes=10)
    claims = _claims(iat=ahead, nbf=ahead, exp=ahead + timedelta(minutes=5))
    _rejected(_token(supabase_jwks, claims))
