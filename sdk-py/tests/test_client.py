"""Unit tests for the Python SDK. Mocks the hosted API with respx."""

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


@respx.mock
def test_check_pass() -> None:
    respx.get(f"{BASE}/api/check").respond(
        200,
        json={
            "ok": True,
            "sats": 125000,
            "days": 47,
            "score": 18.2,
            "attestation_id": "a" * 64,
            "address": "bc1qtest",
            "identities": [{"protocol": "github", "identifier": "alice"}],
            "network": "mainnet",
        },
    )
    r = Client().check(addr="bc1qtest", min_sats=100_000, min_days=30)
    assert r.ok is True
    assert r.sats == 125_000
    assert r.days == 47
    assert r.address == "bc1qtest"
    assert len(r.identities) == 1
    assert r.identities[0].protocol == "github"


@respx.mock
def test_check_below_threshold_returns_ok_false() -> None:
    respx.get(f"{BASE}/api/check").respond(
        200,
        json={
            "ok": False,
            "sats": 1000,
            "days": 2,
            "score": 0,
            "reasons": ["below_min_sats", "below_min_days"],
        },
    )
    r = Client().check(addr="bc1qtest", min_sats=100_000, min_days=30)
    assert r.ok is False
    assert "below_min_sats" in r.reasons


@respx.mock
def test_check_not_found_returns_ok_false() -> None:
    respx.get(f"{BASE}/api/check").respond(
        404, json={"ok": False, "reasons": ["not_found"]}
    )
    r = Client().check(addr="bc1qabsent")
    assert r.ok is False
    assert "not_found" in r.reasons


@respx.mock
def test_check_rate_limited() -> None:
    respx.get(f"{BASE}/api/check").respond(429, json={"error": "rate_limited"})
    with pytest.raises(RateLimitError):
        Client().check(addr="bc1qtest")


def test_check_requires_subject() -> None:
    with pytest.raises(ValueError):
        Client().check()


@respx.mock
def test_verify() -> None:
    respx.post(f"{BASE}/api/verify").respond(
        200,
        json={
            "ok": True,
            "codes": ["sig_ok_bip322", "bond_confirmed"],
            "network": "mainnet",
            "metrics": {"sats_bonded": 125000, "days_unspent": 47, "score": 18.2},
        },
    )
    r = Client().verify(addr="bc1qtest", msg="orangecheck\n...", sig="AkcwRAIg...")
    assert r.ok is True
    assert r.sats_bonded == 125_000
    assert "bond_confirmed" in r.codes


@respx.mock
def test_discover() -> None:
    respx.get(f"{BASE}/api/discover").respond(
        200,
        json={
            "count": 1,
            "total": 1,
            "attestations": [
                {
                    "attestation_id": "a" * 64,
                    "address": "bc1qtest",
                    "scheme": "bip322",
                    "identities": [{"protocol": "github", "identifier": "alice"}],
                    "issued_at": "2026-04-20T12:00:00Z",
                }
            ],
        },
    )
    r = Client().discover(addr="bc1qtest")
    assert r.count == 1
    assert r.attestations[0].address == "bc1qtest"


@respx.mock
def test_challenge_issue_and_verify() -> None:
    respx.get(f"{BASE}/api/challenge").respond(
        200,
        json={
            "message": "orangecheck-auth\n...",
            "nonce": "a" * 32,
            "expiresAt": 1700000000000,
            "expiresAtIso": "2023-11-14T22:13:20Z",
        },
    )
    respx.post(f"{BASE}/api/challenge").respond(
        200,
        json={
            "ok": True,
            "reason": "ok",
            "address": "bc1qproven",
            "nonce": "a" * 32,
            "expiresAt": 1700000000000,
        },
    )

    c = Client()
    ch = c.challenge_issue(addr="bc1qtest", audience="https://example.com")
    assert ch.nonce == "a" * 32

    verified = c.challenge_verify(
        message=ch.message, signature="AkcwRAIg...", expected_nonce=ch.nonce
    )
    assert verified.address == "bc1qproven"


@respx.mock
def test_challenge_verify_failure() -> None:
    respx.post(f"{BASE}/api/challenge").respond(
        401, json={"ok": False, "reason": "sig_invalid"}
    )
    with pytest.raises(VerificationError):
        Client().challenge_verify(message="x" * 40, signature="bogus_signature_long_enough")


@respx.mock
def test_server_error_raises() -> None:
    respx.get(f"{BASE}/api/check").respond(500, json={"error": "server_error"})
    with pytest.raises(OrangeCheckError):
        Client().check(addr="bc1qtest")


@respx.mock
@pytest.mark.asyncio
async def test_async_check() -> None:
    respx.get(f"{BASE}/api/check").respond(
        200,
        json={
            "ok": True,
            "sats": 200_000,
            "days": 60,
            "score": 20.0,
            "address": "bc1qtest",
        },
    )
    async with AsyncClient() as ac:
        r = await ac.check(addr="bc1qtest")
    assert r.ok is True
    assert r.sats == 200_000


@respx.mock
def test_custom_base_url() -> None:
    respx.get("https://custom.example.com/api/check").respond(
        200,
        json={"ok": True, "sats": 1, "days": 1, "score": 1},
    )
    r = Client(base_url="https://custom.example.com").check(addr="bc1q")
    assert r.ok is True


def test_client_context_manager_closes_session() -> None:
    with Client() as c:
        assert isinstance(c._session, httpx.Client)
