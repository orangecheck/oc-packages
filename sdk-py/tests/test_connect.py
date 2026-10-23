"""
OC Connect from a site's own backend, held to me-client's vectors.

``me-client/test-vectors/connect.json`` is read here and by me-client's
``src/__tests__/connect.test.ts``, so a Python site and a Node site send the
same requests and get the same result from the same answer.

A refusal or an outage is a result, never an exception: a failed call must not
block the site's own login. Only a mistake in the call itself raises.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from orangecheck import (
    CONNECT_CONSENT_BLURB,
    CONNECT_CONSENT_LABEL,
    ConnectAccount,
    ConnectClaimLink,
    ConnectDeleted,
    ConnectRefusal,
    connect_claim_link,
    connect_delete,
    connect_provision,
)

VECTORS_PATH = Path(__file__).resolve().parents[2] / "me-client" / "test-vectors" / "connect.json"
V: dict[str, Any] = json.loads(VECTORS_PATH.read_text())
KEY = "ck_live_test_key"
CALLS = {"provision": connect_provision, "delete": connect_delete, "claim_link": connect_claim_link}


def _call(name: str, data: dict[str, Any]) -> Any:
    kwargs = {k: v for k, v in data.items() if k != "user_id"}
    return CALLS[name](KEY, data["user_id"], **kwargs)


def _as_dict(result: Any) -> dict[str, Any]:
    if isinstance(result, ConnectRefusal):
        return {"ok": False, "reason": result.reason, "status": result.status}
    if isinstance(result, ConnectAccount):
        return {"ok": True, "did_oc": result.did_oc, "is_new": result.is_new}
    if isinstance(result, ConnectDeleted):
        return {"ok": True, "result": result.result}
    if isinstance(result, ConnectClaimLink):
        return {"ok": True, "url": result.url, "expires_at": result.expires_at}
    raise AssertionError(f"not a Connect result: {result!r}")


@pytest.mark.parametrize("r", V["requests"], ids=[r["name"] for r in V["requests"]])
@respx.mock
def test_what_each_call_sends(r: dict[str, Any]) -> None:
    route = respx.post(f"https://ochk.io{r['path']}").mock(
        return_value=httpx.Response(500, json={"ok": False, "reason": "server_error"})
    )
    _call(r["call"], r["input"])
    assert route.call_count == 1
    req = route.calls.last.request
    assert req.headers["authorization"] == f"Bearer {KEY}"
    assert req.headers["content-type"] == "application/json"
    assert json.loads(req.content) == r["body"]


@pytest.mark.parametrize("a", V["answers"], ids=[a["name"] for a in V["answers"]])
@respx.mock
def test_what_each_answer_becomes(a: dict[str, Any]) -> None:
    path = {"provision": "provision", "delete": "delete", "claim_link": "claim-link"}[a["call"]]
    if "raw" in a:
        response = httpx.Response(a["status"], text=a["raw"], headers={"content-type": "text/html"})
    else:
        response = httpx.Response(a["status"], json=a["body"])
    respx.post(f"https://ochk.io/api/connect/{path}").mock(return_value=response)
    result = _call(a["call"], {"user_id": "user-1"})
    assert result.ok is a["result"]["ok"]
    assert _as_dict(result) == a["result"]


@respx.mock
def test_a_network_failure_is_unavailable() -> None:
    respx.post("https://ochk.io/api/connect/provision").mock(side_effect=httpx.ConnectError("down"))
    assert connect_provision(KEY, "u") == ConnectRefusal(reason="unavailable", status=0)


@respx.mock
def test_a_call_that_never_answers_is_unavailable_after_the_timeout() -> None:
    respx.post("https://ochk.io/api/connect/provision").mock(side_effect=httpx.ReadTimeout("slow"))
    started = time.monotonic()
    assert connect_provision(KEY, "u", timeout=0.05) == ConnectRefusal(reason="unavailable", status=0)
    assert time.monotonic() - started < 2


def test_the_timeout_is_bounded() -> None:
    with pytest.raises(ValueError, match="timeout"):
        connect_provision(KEY, "u", timeout=0)
    with pytest.raises(ValueError, match="timeout"):
        connect_provision(KEY, "u", timeout=60)


@respx.mock
def test_an_option_it_does_not_read_raises_before_sending() -> None:
    route = respx.post(url__regex=r"https://ochk\.io/.*").mock(return_value=httpx.Response(200, json={}))
    with pytest.raises(TypeError, match="concent"):
        connect_provision(KEY, "u", concent=True)  # type: ignore[call-arg]
    with pytest.raises(TypeError, match="consent"):
        connect_delete(KEY, "u", consent=True)  # type: ignore[call-arg]
    with pytest.raises(TypeError, match="email"):
        connect_claim_link(KEY, "u", email="a@b.example")  # type: ignore[call-arg]
    assert route.call_count == 0


@respx.mock
def test_consent_false_raises_because_an_unticked_box_means_no_call() -> None:
    route = respx.post(url__regex=r"https://ochk\.io/.*").mock(return_value=httpx.Response(200, json={}))
    with pytest.raises(ValueError, match="consent"):
        connect_provision(KEY, "u", consent=False)  # type: ignore[arg-type]
    assert route.call_count == 0


@respx.mock
def test_no_key_no_user_id_or_one_the_server_would_refuse() -> None:
    route = respx.post(url__regex=r"https://ochk\.io/.*").mock(return_value=httpx.Response(200, json={}))
    with pytest.raises(ValueError, match="api_key"):
        connect_provision("", "u")
    with pytest.raises(ValueError, match="user_id"):
        connect_provision(KEY, "")
    with pytest.raises(ValueError, match="user_id"):
        connect_provision(KEY, "x" * 257)
    with pytest.raises(ValueError, match="email"):
        connect_provision(KEY, "u", email_verified=True)
    with pytest.raises(ValueError, match="origin"):
        connect_provision(KEY, "u", origin="http://ochk.io")
    assert route.call_count == 0


def test_the_consent_words_are_the_vectors() -> None:
    assert CONNECT_CONSENT_LABEL == V["consent"]["label"]
    assert CONNECT_CONSENT_BLURB == V["consent"]["blurb"]


def test_the_consent_words_say_nothing_about_earnings() -> None:
    text = f"{CONNECT_CONSENT_LABEL} {CONNECT_CONSENT_BLURB}"
    assert not re.search(r"earn|sats|bitcoin|pay|money|reward", text, re.IGNORECASE)
