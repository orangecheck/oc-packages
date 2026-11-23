"""
The one rule for an origin a site names, held to auth-core's vectors.

``auth-core/test-vectors/issuer-origin.json`` is read here and by auth-core's
``src/__tests__/issuer-origin.test.ts``, so a Python site and a Node site take
the same issuers and me.ochk.io origins, and name the same origin for each.
"""

from __future__ import annotations

import base64
import json
import time
from pathlib import Path
from typing import Any, Optional

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

import orangecheck.native as native_module
import orangecheck.tokens as tokens_module
from orangecheck import (
    InvalidSession,
    RevocationList,
    SignInPolicy,
    exchange_native_code,
    revoke_token,
    verify_session,
)
from orangecheck.integrator import _issuer_origin, _issuer_url

VECTORS = json.loads(
    (
        Path(__file__).resolve().parents[2] / "auth-core" / "test-vectors" / "issuer-origin.json"
    ).read_text()
)
ACCEPTED = [(v["input"], v["origin"]) for v in VECTORS["accepted"]]
REFUSED = VECTORS["refused"]
NATIVE = ("code-1", "v" * 43, "com.example.app:/signed-in", "https://site.example")


@pytest.fixture
def posts(monkeypatch):
    """Every URL posted to; nothing leaves the process."""
    sent: list[str] = []

    def post(url, **_kwargs):
        sent.append(url)
        raise AssertionError("posted " + url)

    monkeypatch.setattr(native_module.httpx, "post", post)
    monkeypatch.setattr(tokens_module.httpx, "post", post)
    return sent


@pytest.mark.parametrize("value, origin", ACCEPTED)
def test_takes_an_origin(value, origin):
    assert _issuer_origin(value) == origin
    assert _issuer_url(value) == origin + "/.well-known/jwks.json"


@pytest.mark.parametrize("value", REFUSED + VECTORS["refused_values"])
def test_refuses_anything_else(value):
    with pytest.raises(ValueError, match="issuer must be one origin"):
        _issuer_origin(value)


@pytest.mark.parametrize("value, origin", ACCEPTED)
def test_the_sign_in_rule_is_read_at_me_origin(value, origin):
    assert (
        SignInPolicy("pk_test_origin", me_origin=value)._url
        == origin + "/api/integrator/pk_test_origin/sign-in"
    )


@pytest.mark.parametrize("value", REFUSED)
def test_a_me_origin_that_is_not_one_origin_is_refused_when_made(value):
    with pytest.raises(ValueError, match="me_origin must be one origin"):
        SignInPolicy("pk_test_origin", me_origin=value)


@pytest.mark.parametrize("value, origin", ACCEPTED)
def test_the_list_of_ended_sessions_is_read_at_its_origin(value, origin):
    for url in (value, value.rstrip("/") + "/api/integrator/revocations"):
        assert RevocationList("pk_test_origin", "s" * 64, url=url)._base == origin


@pytest.mark.parametrize("value", REFUSED)
def test_a_list_url_whose_origin_is_not_one_origin_is_refused_when_made(value):
    for url in (value, value + "/api/integrator/revocations"):
        with pytest.raises(
            ValueError,
            match="RevocationList: url must be <origin>/api/integrator/revocations, its origin must be one origin",
        ):
            RevocationList("pk_test_origin", "s" * 64, url=url)


@pytest.mark.parametrize("value", REFUSED)
def test_verify_session_refuses_the_issuer_before_reading_the_token(value):
    with pytest.raises(ValueError, match="issuer must be one origin"):
        verify_session("not.a.token", "https://site.example", issuer=value)


@pytest.mark.parametrize("value", REFUSED)
def test_revoke_refuses_the_issuer_before_sending(value, posts):
    with pytest.raises(ValueError, match="revoke_token: issuer must be one origin"):
        revoke_token("a.b.c", issuer=value)
    assert posts == []


@pytest.mark.parametrize("value", REFUSED)
def test_the_native_trade_refuses_the_issuer_before_sending(value, posts):
    with pytest.raises(ValueError, match="exchange_native_code: issuer must be one origin"):
        exchange_native_code(*NATIVE, project_key="pk_test_origin", issuer=value)
    assert posts == []


@pytest.mark.parametrize("value", REFUSED)
def test_the_native_trade_refuses_me_origin_before_sending(value, posts):
    with pytest.raises(ValueError, match="me_origin must be one origin"):
        exchange_native_code(*NATIVE, project_key="pk_test_origin", me_origin=value)
    assert posts == []


KEY = Ed25519PrivateKey.generate()
AUD = "https://site.example"


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


JWKS = {
    "keys": [
        {
            "kty": "OKP",
            "crv": "Ed25519",
            "x": _b64(KEY.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)),
            "kid": "k-origin",
            "alg": "EdDSA",
        }
    ]
}


def _token(iss: Optional[str]) -> str:
    now = int(time.time())
    header = {"alg": "EdDSA", "typ": "JWT", "kid": "k-origin"}
    payload: dict[str, Any] = {
        "aud": AUD,
        "sub": "acct-1",
        "did_oc": "did:oc:abc",
        "jti": "j1",
        "rh": "h1",
    }
    payload.update(iat=now, exp=now + 300)
    if iss is not None:
        payload["iss"] = iss
    signing = f"{_b64(json.dumps(header).encode())}.{_b64(json.dumps(payload).encode())}"
    return f"{signing}.{_b64(KEY.sign(signing.encode('ascii')))}"


@pytest.mark.parametrize("value, origin", ACCEPTED)
def test_a_token_whose_iss_is_the_issuers_origin_verifies(value, origin):
    assert verify_session(_token(origin), AUD, jwks=JWKS, issuer=value).sub == "acct-1"


@pytest.mark.parametrize("value, origin", ACCEPTED)
def test_a_token_whose_iss_is_the_issuer_as_given_verifies(value, origin):
    assert verify_session(_token(value), AUD, jwks=JWKS, issuer=value).sub == "acct-1"


@pytest.mark.parametrize(
    "iss, issuer",
    [("https://other.example", "https://OCHK.io"), (None, "https://ochk.io"), (None, "stand-in")],
)
def test_a_token_whose_iss_names_another_issuer_is_refused(iss, issuer):
    with pytest.raises(InvalidSession) as err:
        verify_session(_token(iss), AUD, jwks=JWKS, issuer=issuer)
    assert err.value.reason == "issuer"


def test_with_jwks_a_stand_in_issuer_need_not_be_an_origin():
    assert verify_session(_token("stand-in"), AUD, jwks=JWKS, issuer="stand-in").sub == "acct-1"
