"""
When a retired key still vouches for a token, as auth-core's
``retiredKeyVouches`` reads it, held to ``auth-core/test-vectors/retired-key.json``,
which auth-core's tests read too. ``verify_session`` refuses anything else
signed by a retired key with reason ``retired_key``.
"""

from __future__ import annotations

import base64
import json
import math
import time
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from orangecheck import TOKEN_MAX_LIFETIME_SEC, InvalidSession, retired_key_vouches, verify_session

V: dict[str, Any] = json.loads(
    (Path(__file__).resolve().parents[2] / "auth-core" / "test-vectors" / "retired-key.json").read_text()
)
SPECIAL = {"NaN": math.nan, "Infinity": math.inf}


def _value(v: Any) -> Any:
    return SPECIAL[v["$number"]] if isinstance(v, dict) and "$number" in v else v


def test_the_bound_is_the_longest_ochk_io_signs() -> None:
    assert TOKEN_MAX_LIFETIME_SEC == V["max_lifetime_sec"]


@pytest.mark.parametrize("case", V["cases"], ids=lambda c: c["name"])
def test_retired_key_vouches(case: dict[str, Any]) -> None:
    claims = {k: _value(case[k]) for k in ("iat", "exp") if k in case}
    assert retired_key_vouches(claims, V["retired_at"]) is case["vouches"]


def test_an_unreadable_retirement_time_vouches_for_nothing() -> None:
    assert retired_key_vouches({"iat": 1, "exp": 2}, 0) is False


ISSUER = "https://ochk.io"
AUD = "https://example.com"
KID = "old-key"
KEY = Ed25519PrivateKey.generate()


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _jwks(retired_at: float) -> dict[str, Any]:
    x = KEY.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return {
        "keys": [
            {
                "kty": "OKP",
                "crv": "Ed25519",
                "x": _b64(x),
                "kid": KID,
                "alg": "EdDSA",
                "status": "retired",
                "retired_at": retired_at,
            }
        ]
    }


def _token(iat: float, exp: float) -> str:
    header = {"alg": "EdDSA", "typ": "JWT", "kid": KID}
    payload = {"iss": ISSUER, "aud": AUD, "sub": "acct-1", "did_oc": "did:oc:abc", "jti": "j1", "rh": "h1"}
    payload.update(iat=iat, exp=exp)
    signing = f"{_b64(json.dumps(header).encode())}.{_b64(json.dumps(payload).encode())}"
    return f"{signing}.{_b64(KEY.sign(signing.encode('ascii')))}"


def test_verify_session_holds_a_retired_key_to_the_bound() -> None:
    retired_at = math.floor(time.time()) - 600
    jwks = _jwks(retired_at)
    iat = retired_at - 60
    ok = verify_session(_token(iat, iat + TOKEN_MAX_LIFETIME_SEC), audience=AUD, jwks=jwks)
    assert ok.sub == "acct-1"
    for token in (
        _token(iat, iat + TOKEN_MAX_LIFETIME_SEC + 1),
        # Backdated iat, an exp years ahead.
        _token(retired_at - 86_400 * 365, time.time() + 86_400 * 3650),
        _token(retired_at, retired_at + 3600),
    ):
        with pytest.raises(InvalidSession) as err:
            verify_session(token, audience=AUD, jwks=jwks)
        assert err.value.reason == "retired_key"
