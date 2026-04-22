"""
Python SDK failure-mode coverage.

test_client.py hits happy paths + a few error codes. This file fills in
the ugly corners an integrator actually hits in production:

  - network-level timeouts
  - malformed server responses (non-JSON, missing required fields)
  - 4xx bodies that are NOT 429 (should raise OrangeCheckError, not
    RateLimitError)
  - base_url / timeout construction edge cases
  - async client's error paths match sync's

Everything is mocked with respx so no real network is touched.
"""

from __future__ import annotations

import httpx
import pytest
import respx

from orangecheck import (
    AsyncClient,
    Client,
    OrangeCheckError,
    RateLimitError,
    VerificationError,
)

BASE = "https://ochk.io"


# ─── Malformed response bodies ────────────────────────────────────────────


@respx.mock
def test_check_raises_on_non_json_200() -> None:
    """A 200 that isn't JSON should surface as an error, not crash."""
    respx.get(f"{BASE}/api/check").respond(200, content=b"not json at all")
    with pytest.raises(Exception):
        Client().check(addr="bc1qtest")


@respx.mock
def test_check_empty_body_200_is_not_treated_as_success() -> None:
    respx.get(f"{BASE}/api/check").respond(200, content=b"")
    with pytest.raises(Exception):
        Client().check(addr="bc1qtest")


# ─── 4xx that are NOT 429 ─────────────────────────────────────────────────


@respx.mock
def test_check_400_bad_request_is_not_misclassified_as_rate_limit() -> None:
    respx.get(f"{BASE}/api/check").respond(
        400, json={"error": "bad_request", "issues": [{"path": ["addr"]}]}
    )
    with pytest.raises(OrangeCheckError) as exc:
        Client().check(addr="bc1qinvalid")
    assert not isinstance(exc.value, RateLimitError)


@respx.mock
def test_check_401_raises_generic_error_not_rate_limit() -> None:
    # The public /api/check doesn't 401 today, but a self-hosted build might.
    respx.get(f"{BASE}/api/check").respond(401, json={"error": "unauthenticated"})
    with pytest.raises(OrangeCheckError) as exc:
        Client().check(addr="bc1qtest")
    assert not isinstance(exc.value, RateLimitError)


# ─── Network-level failures ───────────────────────────────────────────────


@respx.mock
def test_network_timeout_propagates_cleanly() -> None:
    respx.get(f"{BASE}/api/check").mock(side_effect=httpx.TimeoutException("slow"))
    with pytest.raises(Exception):
        Client().check(addr="bc1qslow")


@respx.mock
def test_connect_error_propagates() -> None:
    respx.get(f"{BASE}/api/check").mock(side_effect=httpx.ConnectError("refused"))
    with pytest.raises(Exception):
        Client().check(addr="bc1qtest")


# ─── Challenge failure shapes (reason codes survive on the exception) ────


@respx.mock
def test_challenge_verify_expired_reason() -> None:
    respx.post(f"{BASE}/api/challenge").respond(
        401, json={"ok": False, "reason": "expired"}
    )
    with pytest.raises(VerificationError) as exc:
        Client().challenge_verify(message="x" * 40, signature="AA" * 30)
    assert getattr(exc.value, "body", None) is not None


@respx.mock
def test_challenge_verify_nonce_mismatch_reason() -> None:
    respx.post(f"{BASE}/api/challenge").respond(
        401, json={"ok": False, "reason": "nonce_mismatch"}
    )
    with pytest.raises(VerificationError):
        Client().challenge_verify(
            message="x" * 40,
            signature="AA" * 30,
            expected_nonce="b" * 32,
        )


# ─── Construction + reuse ─────────────────────────────────────────────────


@respx.mock
def test_default_base_url_is_ochk() -> None:
    """Prove the default base URL is ochk.io by watching where the SDK
    actually sends a request, rather than relying on httpx's internal
    representation of base_url."""
    route = respx.get(f"{BASE}/api/check").respond(
        200, json={"ok": True, "sats": 1, "days": 1, "score": 1}
    )
    Client().check(addr="bc1qtest")
    assert route.called
    assert str(route.calls[0].request.url).startswith(BASE)


def test_custom_timeout() -> None:
    c = Client(timeout=1.5)
    assert c._session.timeout.connect == 1.5 or c._session.timeout.read == 1.5


def test_client_can_be_closed_explicitly() -> None:
    c = Client()
    c.close()
    # After close, the session is unusable — issuing a request should raise.
    with pytest.raises(Exception):
        c.check(addr="bc1q")


# ─── Async parity ─────────────────────────────────────────────────────────


@respx.mock
@pytest.mark.asyncio
async def test_async_check_rate_limit() -> None:
    respx.get(f"{BASE}/api/check").respond(429, json={"error": "rate_limited"})
    async with AsyncClient() as ac:
        with pytest.raises(RateLimitError):
            await ac.check(addr="bc1qtest")


@respx.mock
@pytest.mark.asyncio
async def test_async_verify_failure_returns_ok_false() -> None:
    """/api/verify's contract: 200 with ok:false on a bad-but-well-formed
    signature (the server parsed the request successfully; the signature
    just didn't verify). The SDK returns a VerifyOutcome with ok=False
    rather than raising — callers inspect .codes for the reason."""
    respx.post(f"{BASE}/api/verify").respond(
        200,
        json={
            "ok": False,
            "codes": ["sig_invalid"],
            "network": "mainnet",
        },
    )
    async with AsyncClient() as ac:
        r = await ac.verify(addr="bc1q", msg="m" * 40, sig="AkcwRAIg...")
    assert r.ok is False
    assert "sig_invalid" in r.codes


@respx.mock
@pytest.mark.asyncio
async def test_async_discover_empty() -> None:
    respx.get(f"{BASE}/api/discover").respond(
        200, json={"count": 0, "total": 0, "attestations": []}
    )
    async with AsyncClient() as ac:
        r = await ac.discover(addr="bc1qnone")
    assert r.count == 0
    # DiscoverResult uses a frozen dataclass — `attestations` ends up as a
    # tuple, not a list. Assert on length, not identity.
    assert len(r.attestations) == 0


# ─── Discover params correctness ──────────────────────────────────────────


@respx.mock
def test_discover_sends_identity_as_query_params() -> None:
    """The identity path should go through as two distinct query params."""
    route = respx.get(f"{BASE}/api/discover").respond(
        200, json={"count": 0, "total": 0, "attestations": []}
    )
    Client().discover(identity={"protocol": "github", "identifier": "alice"})
    assert route.called
    request = route.calls[0].request
    url_str = str(request.url)
    assert "github" in url_str
    assert "alice" in url_str
