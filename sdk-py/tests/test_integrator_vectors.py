"""
ochk.app integrator wire formats, held to me-client's vectors.

``me-client/test-vectors/integrator.json`` is read here and by me-client's
``src/__tests__/integrator-vectors.test.ts``. Both SDKs must accept every
valid vector and refuse every invalid one, so a Python backend and a Node
backend can't drift apart. Regenerate with
``node me-client/scripts/gen-integrator-vectors.mjs``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

import orangecheck.integrator as integrator
from orangecheck import (
    InvalidSession,
    InvalidWebhook,
    sign_event,
    verify_session,
    verify_webhook,
)

VECTORS_PATH = Path(__file__).resolve().parents[2] / "me-client" / "test-vectors" / "integrator.json"
V: dict[str, Any] = json.loads(VECTORS_PATH.read_text())


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(integrator.time, "time", lambda: float(V["now"]))


@pytest.fixture
def fresh_key_sets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(integrator, "_session_keys", integrator._KeySet(integrator.SESSION_JWKS_URL))
    monkeypatch.setattr(integrator, "_webhook_keys", integrator._KeySet(integrator.WEBHOOK_JWKS_URL))


# ─── sign-in tokens ──────────────────────────────────────────────────────


@pytest.mark.parametrize("v", V["session"]["valid"], ids=lambda v: v["name"])
def test_session_accepts(v: dict[str, Any]) -> None:
    s = verify_session(v["token"], v["audience"], jwks=V["session"]["jwks"])
    for k, want in v["claims"].items():
        assert s.claims[k] == want
    assert s.did_oc == v["claims"]["did_oc"]
    assert s.sub == v["claims"]["sub"]


@pytest.mark.parametrize("v", V["session"]["invalid"], ids=lambda v: v["name"])
def test_session_refuses(v: dict[str, Any]) -> None:
    with pytest.raises(InvalidSession) as err:
        verify_session(v["token"], v["audience"], jwks=V["session"]["jwks"])
    assert err.value.reason == v["reason"]


@respx.mock
def test_session_fetches_the_ochk_io_key_set_once(fresh_key_sets: None) -> None:
    route = respx.get("https://ochk.io/.well-known/jwks.json").mock(
        return_value=httpx.Response(200, json=V["session"]["jwks"])
    )
    v = V["session"]["valid"][0]
    verify_session(v["token"], v["audience"])
    verify_session(v["token"], v["audience"])
    assert route.call_count == 1


@respx.mock
def test_session_keeps_a_key_set_through_an_outage(fresh_key_sets: None) -> None:
    route = respx.get("https://ochk.io/.well-known/jwks.json").mock(
        side_effect=[httpx.Response(200, json=V["session"]["jwks"]), httpx.Response(503)]
    )
    v = V["session"]["valid"][0]
    verify_session(v["token"], v["audience"])
    # The hour is up, the refetch fails, and the keys already held still verify.
    integrator._session_keys._fetched_at = V["now"] - 3600
    assert verify_session(v["token"], v["audience"]).did_oc == v["claims"]["did_oc"]
    assert route.call_count == 2


@respx.mock
def test_session_stops_leaning_on_a_key_set_six_hours_old(fresh_key_sets: None) -> None:
    respx.get("https://ochk.io/.well-known/jwks.json").mock(
        side_effect=[httpx.Response(200, json=V["session"]["jwks"])] + [httpx.Response(503)] * 3
    )
    v = V["session"]["valid"][0]
    verify_session(v["token"], v["audience"])
    integrator._session_keys._fetched_at = V["now"] - 5 * 3600
    assert verify_session(v["token"], v["audience"]).did_oc == v["claims"]["did_oc"]
    integrator._session_keys._fetched_at = V["now"] - 6 * 3600 - 1
    with pytest.raises(InvalidSession) as err:
        verify_session(v["token"], v["audience"])
    assert err.value.reason == "key_set_unavailable"


@respx.mock
def test_webhook_stops_leaning_on_a_key_set_six_hours_old(fresh_key_sets: None) -> None:
    respx.get("https://me.ochk.io/api/dev-jwks").mock(
        side_effect=[httpx.Response(200, json=V["webhook"]["jwks"])] + [httpx.Response(503)] * 3
    )
    v = V["webhook"]["valid"][0]
    verify_webhook(v["headers"], v["body"])
    integrator._webhook_keys._fetched_at = V["now"] - 6 * 3600 - 1
    with pytest.raises(InvalidWebhook) as err:
        verify_webhook(v["headers"], v["body"])
    assert err.value.reason == "key_set_unavailable"


@respx.mock
def test_session_without_any_key_set_is_refused(fresh_key_sets: None) -> None:
    respx.get("https://ochk.io/.well-known/jwks.json").mock(return_value=httpx.Response(503))
    v = V["session"]["valid"][0]
    with pytest.raises(InvalidSession) as err:
        verify_session(v["token"], v["audience"])
    assert err.value.reason == "key_set_unavailable"


def test_session_leeway_admits_a_token_just_expired() -> None:
    expired = next(v for v in V["session"]["invalid"] if v["name"] == "expired")
    s = verify_session(expired["token"], expired["audience"], jwks=V["session"]["jwks"], leeway=5)
    assert s.did_oc


# ─── event signatures ────────────────────────────────────────────────────


@pytest.mark.parametrize("v", V["event"], ids=lambda v: v["name"])
def test_sign_event_matches_the_node_sdk(v: dict[str, Any]) -> None:
    assert sign_event(v["secret"], v["body"], timestamp=v["timestamp"]) == v["header"]
    assert sign_event(v["secret"], v["body"].encode("utf-8"), timestamp=v["timestamp"]) == v["header"]


@pytest.mark.parametrize("v", V["event"], ids=lambda v: v["name"])
def test_event_body_is_what_json_dumps_gives_with_compact_separators(v: dict[str, Any]) -> None:
    # The docs build the body with json.dumps(..., separators=(",", ":"),
    # ensure_ascii=False); any serialisation works if you sign what you send.
    assert json.dumps(v["fields"], separators=(",", ":"), ensure_ascii=False) == v["body"]


def test_sign_event_uses_the_clock_by_default() -> None:
    v = V["event"][0]
    assert sign_event(v["secret"], v["body"]).startswith(f"t={V['now']},v1=")


# ─── webhooks ────────────────────────────────────────────────────────────


@pytest.mark.parametrize("v", V["webhook"]["valid"], ids=lambda v: v["name"])
def test_webhook_accepts(v: dict[str, Any]) -> None:
    event = verify_webhook(v["headers"], v["body"], jwks=V["webhook"]["jwks"])
    assert event == json.loads(v["body"])
    lower = {k.lower(): val for k, val in v["headers"].items()}
    assert verify_webhook(lower, v["body"].encode("utf-8"), jwks=V["webhook"]["jwks"]) == event


@pytest.mark.parametrize("v", V["webhook"]["invalid"], ids=lambda v: v["name"])
def test_webhook_refuses(v: dict[str, Any]) -> None:
    with pytest.raises(InvalidWebhook) as err:
        verify_webhook(v["headers"], v["body"], jwks=V["webhook"]["jwks"])
    assert err.value.reason == v["reason"]


@respx.mock
def test_webhook_fetches_me_ochk_io_dev_jwks(fresh_key_sets: None) -> None:
    route = respx.get("https://me.ochk.io/api/dev-jwks").mock(
        return_value=httpx.Response(200, json=V["webhook"]["jwks"])
    )
    v = V["webhook"]["valid"][0]
    assert verify_webhook(v["headers"], v["body"])["id"] == "oc-me-tv-1"
    assert route.call_count == 1
