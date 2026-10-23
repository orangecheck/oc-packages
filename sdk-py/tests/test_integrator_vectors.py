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
import os
import threading
import time
from pathlib import Path
from typing import Any, Callable

import httpx
from urllib.parse import quote
import pytest
import respx

import orangecheck.integrator as integrator
from orangecheck import (
    BondRequired,
    InvalidSession,
    SignInPolicy,
    bond_meets,
    InvalidWebhook,
    RevocationList,
    SessionEnded,
    revocation_key,
    sign_event,
    verify_session,
    verify_webhook,
    warm_session,
)

VECTORS_PATH = Path(__file__).resolve().parents[2] / "me-client" / "test-vectors" / "integrator.json"
V: dict[str, Any] = json.loads(VECTORS_PATH.read_text())


def _move_to(monkeypatch: pytest.MonkeyPatch, t: float) -> None:
    """Both clocks at ``t``: the wall clock and the monotonic one the caches measure on."""
    monkeypatch.setattr(integrator.time, "time", lambda: float(t))
    monkeypatch.setattr(integrator, "_clock", lambda: float(t), raising=False)


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    _move_to(monkeypatch, V["now"])


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


def _session_vector(name: str) -> dict[str, Any]:
    return next(v for v in V["session"]["invalid"] if v["name"] == name)


def test_session_without_a_handle_is_accepted_only_when_the_site_opts_out() -> None:
    v = _session_vector("no revocation handle")
    s = verify_session(v["token"], v["audience"], jwks=V["session"]["jwks"], require_handle=False)
    assert s.did_oc == V["session"]["valid"][0]["claims"]["did_oc"]
    assert "rh" not in s.claims


def test_require_handle_takes_a_bool_only() -> None:
    v = V["session"]["valid"][0]
    assert verify_session(v["token"], v["audience"], jwks=V["session"]["jwks"], require_handle=True).did_oc
    for wrong in ("false", 0, None):
        with pytest.raises(TypeError):
            verify_session(v["token"], v["audience"], jwks=V["session"]["jwks"], require_handle=wrong)  # type: ignore[arg-type]


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


# ─── revocation handles ──────────────────────────────────────────────────

R = V["revocation"]


def _revocations() -> RevocationList:
    return RevocationList(R["request"]["project_key"], R["request"]["secret"])


def _serve_lists() -> None:
    for aud, body in R["lists"].items():
        url = f"https://me.ochk.io/api/integrator/revocations?project_key={R['request']['project_key']}&aud={quote(aud, safe='')}"
        respx.get(url).mock(return_value=httpx.Response(200, json=body))


@respx.mock
def test_revocations_request_is_signed_as_the_node_sdk_signs_it() -> None:
    route = respx.get(R["request"]["url"]).mock(return_value=httpx.Response(200, json=R["lists"][R["request"]["aud"]]))
    _revocations().status("any", R["request"]["aud"], 0)
    assert route.call_count == 1
    sent = route.calls[0].request
    assert str(sent.url) == R["request"]["url"]
    assert sent.headers["x-oc-signature"] == R["request"]["header"]


@pytest.mark.parametrize("v", R["keys"], ids=lambda v: v["sub"])
def test_revocation_key_matches_the_node_sdk(v: dict[str, Any]) -> None:
    assert revocation_key("sub", v["sub"]) == v["key"]


@respx.mock
@pytest.mark.parametrize("v", R["sessions"], ids=lambda v: v["name"])
def test_revocations_decide_as_the_node_sdk_does(v: dict[str, Any]) -> None:
    _serve_lists()
    # A key absent from the vector is absent from the claims; null stays null.
    claims = {k: v[k] for k in ("rh", "aud", "iat") if k in v}
    assert _revocations().status_for(claims) == v["status"]
    if "rh" not in v or v["rh"] is not None:
        assert _revocations().status(v.get("rh"), v["aud"], v["iat"]) == v["status"]


@respx.mock
@pytest.mark.parametrize("v", R["tokens"], ids=lambda v: v["name"])
def test_a_whole_token_is_ended_or_refused_as_the_node_sdk_does(v: dict[str, Any]) -> None:
    _serve_lists()
    if v["outcome"] == "ended":
        with pytest.raises(SessionEnded):
            verify_session(v["token"], v["audience"], jwks=V["session"]["jwks"], revocations=_revocations())
    else:
        with pytest.raises(InvalidSession) as err:
            verify_session(v["token"], v["audience"], jwks=V["session"]["jwks"], revocations=_revocations())
        assert err.value.reason == v["outcome"]


def test_a_session_names_its_revocation_handle() -> None:
    v = V["session"]["valid"][0]
    s = verify_session(v["token"], v["audience"], jwks=V["session"]["jwks"])
    assert s.rh == v["claims"]["rh"]


@pytest.mark.parametrize("name", ["a revocation handle that is not a string", "an empty revocation handle"])
def test_a_handle_that_is_not_a_non_empty_string_is_refused_even_without_require_handle(name: str) -> None:
    v = next(x for x in V["session"]["invalid"] if x["name"] == name)
    with pytest.raises(InvalidSession) as err:
        verify_session(v["token"], v["audience"], jwks=V["session"]["jwks"], require_handle=False)
    assert err.value.reason == "claims"


def test_a_handle_with_a_list_aud_is_refused_even_without_require_handle() -> None:
    v = next(x for x in V["session"]["invalid"] if x["name"] == "a handle with a list aud")
    with pytest.raises(InvalidSession) as err:
        verify_session(v["token"], v["audience"], jwks=V["session"]["jwks"], require_handle=False)
    assert err.value.reason == "audience"


@respx.mock
def test_a_token_with_no_handle_is_never_looked_up() -> None:
    route = respx.get(url__startswith="https://me.ochk.io/api/integrator/revocations").mock(
        return_value=httpx.Response(200, json={})
    )
    assert _revocations().status(None, R["request"]["aud"], 0) == "live"
    assert route.call_count == 0


@respx.mock
def test_revocations_are_fetched_at_most_once_a_minute_per_audience(monkeypatch: pytest.MonkeyPatch) -> None:
    route = respx.get(R["request"]["url"]).mock(return_value=httpx.Response(200, json=R["lists"][R["request"]["aud"]]))
    rl = _revocations()
    rl.status("x", R["request"]["aud"], 0)
    rl.status("x", R["request"]["aud"], 0)
    assert route.call_count == 1
    _move_to(monkeypatch, V["now"] + 61)
    rl.status("x", R["request"]["aud"], 0)
    assert route.call_count == 2


@respx.mock
def test_a_list_dated_too_old_or_too_far_ahead_cannot_vouch(monkeypatch: pytest.MonkeyPatch) -> None:
    body = dict(R["lists"][R["request"]["aud"]])
    respx.get(R["request"]["url"]).mock(return_value=httpx.Response(200, json=body))
    _move_to(monkeypatch, V["now"] + 11 * 60)
    assert _revocations().status("x", R["request"]["aud"], 0) == "unverified"
    _move_to(monkeypatch, V["now"] - 5 * 60)
    assert _revocations().status("x", R["request"]["aud"], 0) == "unverified"
    _move_to(monkeypatch, V["now"] - 30)
    assert _revocations().status("x", R["request"]["aud"], 0) == "live"


def _rh_vector() -> dict[str, Any]:
    return next(v for v in V["session"]["valid"] if v["claims"].get("rh"))


@respx.mock
def test_verify_session_refuses_a_session_whose_handle_is_ended() -> None:
    v = _rh_vector()
    url = f"https://me.ochk.io/api/integrator/revocations?project_key={R['request']['project_key']}&aud={quote(v['audience'], safe='')}"
    respx.get(url).mock(return_value=httpx.Response(200, json={
        "v": 1, "at": V["now"], "tokens": [], "accounts": {}, "handles": {v["claims"]["rh"]: v["claims"]["iat"] + 1},
    }))
    with pytest.raises(SessionEnded) as err:
        verify_session(v["token"], v["audience"], jwks=V["session"]["jwks"], revocations=_revocations())
    assert isinstance(err.value, InvalidSession)
    assert err.value.reason == "ended"


@respx.mock
def test_verify_session_keeps_reads_refuses_writes_and_warns_once_while_the_list_cannot_be_read(
    caplog: pytest.LogCaptureFixture,
) -> None:
    respx.get(url__startswith="https://me.ochk.io/api/integrator/revocations").mock(return_value=httpx.Response(503))
    v = _rh_vector()
    rl = _revocations()
    with caplog.at_level("WARNING", logger="orangecheck"):
        s = verify_session(v["token"], v["audience"], jwks=V["session"]["jwks"], revocations=rl, method="GET")
        assert s.sub == v["claims"]["sub"]
        with pytest.raises(InvalidSession) as err:
            verify_session(v["token"], v["audience"], jwks=V["session"]["jwks"], revocations=rl, method="POST")
        assert err.value.reason == "revocations_unavailable"
    warnings = [r for r in caplog.records if r.name == "orangecheck" and r.levelname == "WARNING"]
    assert len(warnings) == 1


# ─── who may sign in (coin backing) ──────────────────────────────────────

B = V["bond"]


@pytest.mark.parametrize("v", B, ids=lambda v: v["name"])
def test_bond_meets_as_the_node_sdk_decides(v: dict[str, Any]) -> None:
    claims = {"sub": "s", "did_oc": "d", "jti": "j", **({"oc_bond": v["bond"]} if v["bond"] else {})}
    need = v["need"]
    assert bond_meets(claims, min_sats=need.get("min_sats", 0), min_days=need.get("min_days", 0),
                      max_age_secs=need.get("max_age_secs")) is v["meets"]


def _bond_vector() -> dict[str, Any]:
    return next(v for v in V["session"]["valid"] if v["name"] == "backed by a coin (a complete claim)")


def test_verify_session_require_bond_refuses_an_unbacked_or_short_account() -> None:
    plain = V["session"]["valid"][0]
    with pytest.raises(BondRequired) as err:
        verify_session(plain["token"], plain["audience"], jwks=V["session"]["jwks"], require_bond={"min_sats": 1000})
    assert isinstance(err.value, InvalidSession)
    assert err.value.reason == "bond_required"
    assert err.value.need == {"min_sats": 1000, "min_days": 0}
    assert err.value.have is None
    assert err.value.back_url == "https://ochk.app/me/account#backing"
    backed = _bond_vector()
    s = verify_session(backed["token"], backed["audience"], jwks=V["session"]["jwks"], require_bond={"min_sats": 100000})
    assert s.oc_bond is not None


SIGN_IN = "https://me.ochk.io/api/integrator/pk_test_tv/sign-in"


@respx.mock
def test_sign_in_policy_reads_the_project_requirement_once_a_minute(monkeypatch: pytest.MonkeyPatch) -> None:
    route = respx.get(SIGN_IN).mock(return_value=httpx.Response(200, json={"ok": True, "require_bond": {"min_sats": 100000, "min_days": 30}}))
    policy = SignInPolicy("pk_test_tv")
    plain = V["session"]["valid"][0]
    with pytest.raises(BondRequired) as err:
        verify_session(plain["token"], plain["audience"], jwks=V["session"]["jwks"], policy=policy)
    assert err.value.need == {"min_sats": 100000, "min_days": 30}
    backed = _bond_vector()
    assert verify_session(backed["token"], backed["audience"], jwks=V["session"]["jwks"], policy=policy).sub
    assert route.call_count == 1
    _move_to(monkeypatch, V["now"] + 61)
    policy.requirement()
    assert route.call_count == 2


@respx.mock
def test_sign_in_policy_with_no_requirement_admits_everyone() -> None:
    respx.get(SIGN_IN).mock(return_value=httpx.Response(200, json={"ok": True, "require_bond": None}))
    plain = V["session"]["valid"][0]
    assert verify_session(plain["token"], plain["audience"], jwks=V["session"]["jwks"], policy=SignInPolicy("pk_test_tv")).sub


@respx.mock
def test_require_bond_in_code_wins_over_the_project_policy() -> None:
    route = respx.get(SIGN_IN).mock(return_value=httpx.Response(200, json={"ok": True, "require_bond": {"min_sats": 10000000, "min_days": 365}}))
    backed = _bond_vector()
    s = verify_session(backed["token"], backed["audience"], jwks=V["session"]["jwks"],
                       policy=SignInPolicy("pk_test_tv"), require_bond={"min_sats": 1000})
    assert s.sub
    assert route.call_count == 0


@respx.mock
def test_an_unknown_project_or_an_unreadable_policy_refuses_rather_than_admits() -> None:
    plain = V["session"]["valid"][0]
    respx.get("https://me.ochk.io/api/integrator/pk_test_nope/sign-in").mock(return_value=httpx.Response(404))
    with pytest.raises(InvalidSession) as err:
        verify_session(plain["token"], plain["audience"], jwks=V["session"]["jwks"], policy=SignInPolicy("pk_test_nope"))
    assert err.value.reason == "unknown_project_key"
    respx.get(SIGN_IN).mock(return_value=httpx.Response(503))
    with pytest.raises(InvalidSession) as err2:
        verify_session(plain["token"], plain["audience"], jwks=V["session"]["jwks"], policy=SignInPolicy("pk_test_tv"))
    assert err2.value.reason == "bond_policy_unavailable"


@respx.mock
def test_the_last_requirement_read_stands_through_an_outage(monkeypatch: pytest.MonkeyPatch) -> None:
    respx.get(SIGN_IN).mock(side_effect=[
        httpx.Response(200, json={"ok": True, "require_bond": {"min_sats": 100000, "min_days": 30}}),
        httpx.Response(503),
    ])
    policy = SignInPolicy("pk_test_tv")
    assert policy.requirement() == {"min_sats": 100000, "min_days": 30}
    _move_to(monkeypatch, V["now"] + 61)
    assert policy.requirement() == {"min_sats": 100000, "min_days": 30}


# ─── warming, and sharing between threads ────────────────────────────────


def _serve_everything_verify_session_reads(v: dict[str, Any]) -> list[respx.Route]:
    rl_url = f"https://me.ochk.io/api/integrator/revocations?project_key={R['request']['project_key']}&aud={quote(v['audience'], safe='')}"
    return [
        respx.get("https://ochk.io/.well-known/jwks.json").mock(return_value=httpx.Response(200, json=V["session"]["jwks"])),
        respx.get(SIGN_IN).mock(return_value=httpx.Response(200, json={"ok": True, "require_bond": None})),
        respx.get(rl_url).mock(return_value=httpx.Response(200, json={
            "v": 1, "at": V["now"], "tokens": [], "accounts": {}, "handles": {},
        })),
    ]


@respx.mock
def test_warm_session_fetches_what_verify_session_reads_so_a_request_fetches_nothing(fresh_key_sets: None) -> None:
    v = _rh_vector()
    routes = _serve_everything_verify_session_reads(v)
    rl, policy = _revocations(), SignInPolicy("pk_test_tv")
    warm_session(v["audience"], revocations=rl, policy=policy)
    assert [r.call_count for r in routes] == [1, 1, 1]
    s = verify_session(v["token"], v["audience"], revocations=rl, policy=policy, method="POST")
    assert s.sub == v["claims"]["sub"]
    assert [r.call_count for r in routes] == [1, 1, 1]


@respx.mock
def test_warm_session_never_raises(fresh_key_sets: None) -> None:
    respx.get(url__startswith="https://").mock(return_value=httpx.Response(503))
    warm_session("https://soniq.example", revocations=_revocations(), policy=SignInPolicy("pk_test_tv"))
    respx.get("https://me.ochk.io/api/integrator/pk_test_nope/sign-in").mock(return_value=httpx.Response(404))
    warm_session(["https://soniq.example", "https://www.soniq.example"], policy=SignInPolicy("pk_test_nope"))


@respx.mock
def test_a_failed_key_set_refresh_is_tried_again_after_ten_seconds_not_on_every_request(
    fresh_key_sets: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    route = respx.get("https://ochk.io/.well-known/jwks.json").mock(
        side_effect=[httpx.Response(200, json=V["session"]["jwks"])] + [httpx.Response(503)] * 2
    )
    v = V["session"]["valid"][0]
    verify_session(v["token"], v["audience"])
    integrator._session_keys._fetched_at = V["now"] - 3600
    for _ in range(3):
        assert verify_session(v["token"], v["audience"]).sub == v["claims"]["sub"]
    assert route.call_count == 2
    _move_to(monkeypatch, V["now"] + 11)
    assert verify_session(v["token"], v["audience"]).sub == v["claims"]["sub"]
    assert route.call_count == 3


def _ask_from_threads(n: int, ask: Callable[[], Any]) -> list[Any]:
    out: list[Any] = []
    threads = [threading.Thread(target=lambda: out.append(ask())) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return out


def _slow(response: httpx.Response) -> Callable[[httpx.Request], httpx.Response]:
    def answer(request: httpx.Request) -> httpx.Response:
        time.sleep(0.2)
        return response
    return answer


@respx.mock
def test_one_revocation_list_shared_by_threads_fetches_once_per_audience() -> None:
    route = respx.get(R["request"]["url"]).mock(side_effect=_slow(httpx.Response(200, json=R["lists"][R["request"]["aud"]])))
    rl = _revocations()
    want = next(s for s in R["sessions"] if s["aud"] == R["request"]["aud"] and s["status"] == "revoked")
    out = _ask_from_threads(8, lambda: rl.status(want["rh"], want["aud"], want["iat"]))
    assert out == ["revoked"] * 8
    assert route.call_count == 1


@respx.mock
def test_one_sign_in_policy_shared_by_threads_fetches_once() -> None:
    route = respx.get(SIGN_IN).mock(side_effect=_slow(httpx.Response(200, json={"ok": True, "require_bond": {"min_sats": 1000, "min_days": 0}})))
    policy = SignInPolicy("pk_test_tv")
    assert _ask_from_threads(8, policy.requirement) == [{"min_sats": 1000, "min_days": 0}] * 8
    assert route.call_count == 1


# ─── answers that don't say what they should ─────────────────────────────


@respx.mock
@pytest.mark.parametrize("body", [
    {},
    {"ok": False, "reason": "project_not_found"},
    {"ok": True, "policy": {"require_bond": {"min_sats": 100000}}},
    {"ok": True, "require_bond": {"min_sats": None, "min_days": 0}},
    {"ok": True, "require_bond": {"min_sats": -1, "min_days": 0}},
    {"ok": True, "require_bond": {"min_sats": True, "min_days": 0}},
], ids=["empty", "ok false", "another key", "null floor", "negative floor", "bool floor"])
def test_a_policy_answer_that_does_not_say_the_rule_is_refused_not_read_as_open(body: dict[str, Any]) -> None:
    respx.get(SIGN_IN).mock(return_value=httpx.Response(200, json=body))
    plain = V["session"]["valid"][0]
    with pytest.raises(InvalidSession) as err:
        verify_session(plain["token"], plain["audience"], jwks=V["session"]["jwks"], policy=SignInPolicy("pk_test_tv"))
    assert err.value.reason == "bond_policy_unavailable"
    warm_session(plain["audience"], policy=SignInPolicy("pk_test_tv"))


@respx.mock
def test_the_last_requirement_read_stands_ten_minutes_and_no_longer(monkeypatch: pytest.MonkeyPatch) -> None:
    respx.get(SIGN_IN).mock(side_effect=[httpx.Response(200, json={"ok": True, "require_bond": None})] + [httpx.Response(503)] * 3)
    policy = SignInPolicy("pk_test_tv")
    assert policy.requirement() is None
    _move_to(monkeypatch, V["now"] + 599)
    assert policy.requirement() is None
    _move_to(monkeypatch, V["now"] + 611)
    with pytest.raises(InvalidSession) as err:
        policy.requirement()
    assert err.value.reason == "bond_policy_unavailable"


@respx.mock
@pytest.mark.parametrize("body", [
    {"v": 1, "at": V["now"]},
    {"v": True, "at": V["now"], "tokens": [], "accounts": {}, "handles": {}},
    {"v": 1, "at": V["now"], "tokens": {}, "accounts": {}, "handles": {}},
    {"v": 1, "at": V["now"], "tokens": [], "accounts": [], "handles": {}},
], ids=["no tokens", "v true", "tokens not a list", "accounts not an object"])
def test_a_revocation_list_shaped_unlike_the_node_feed_cannot_vouch(body: dict[str, Any]) -> None:
    respx.get(R["request"]["url"]).mock(return_value=httpx.Response(200, json=body))
    assert _revocations().status("x", R["request"]["aud"], 0) == "unverified"


@respx.mock
def test_a_handle_whose_cutoff_is_not_a_finite_number_is_skipped_as_node_skips_it() -> None:
    respx.get(R["request"]["url"]).mock(return_value=httpx.Response(200, content=(
        '{"v":1,"at":%d,"tokens":[],"accounts":{},"handles":{"a":Infinity,"b":NaN,"c":%d}}' % (V["now"], V["now"] + 1)
    ).encode(), headers={"content-type": "application/json"}))
    rl = _revocations()
    assert [rl.status(h, R["request"]["aud"], V["now"]) for h in ("a", "b", "c")] == ["live", "live", "revoked"]


@pytest.mark.parametrize("bond", [
    {"v": True},
    {"sats_floor": float("inf")},
    {"days_floor": float("nan")},
    {"nullifier": "ab" * 32 + "\n"},
], ids=["v true", "infinite floor", "nan floor", "nullifier with a newline"])
def test_a_bond_claim_node_refuses_is_refused_here(bond: dict[str, Any]) -> None:
    claim = {"v": 1, "sats_floor": 100000, "days_floor": 30, "height": 1, "checked_at": V["now"], "nullifier": "ab" * 32, **bond}
    assert integrator.read_bond_claim({"oc_bond": claim}) is None
    assert not bond_meets({"oc_bond": claim})


def test_bond_age_is_counted_as_node_counts_it() -> None:
    claim = {"v": 1, "sats_floor": 1, "days_floor": 0, "height": 1, "checked_at": V["now"] - 99.5, "nullifier": "ab" * 32}
    assert bond_meets({"oc_bond": claim}, max_age_secs=99.6)  # type: ignore[arg-type]
    assert not bond_meets({"oc_bond": claim}, max_age_secs=99)


@respx.mock
def test_an_empty_key_set_is_not_fetched_again_on_every_call(fresh_key_sets: None) -> None:
    route = respx.get("https://ochk.io/.well-known/jwks.json").mock(return_value=httpx.Response(200, json={"keys": []}))
    for _ in range(5):
        assert integrator._session_keys.get("k1") is None
    assert route.call_count == 2  # the hourly read, and the once-a-minute read for a key not seen


@pytest.mark.skipif(not hasattr(os, "fork"), reason="needs fork")
def test_a_fork_while_a_fetch_holds_a_lock_leaves_the_child_able_to_take_it() -> None:
    policy, rl = SignInPolicy("pk_test_tv"), _revocations()
    one = rl._list(R["request"]["aud"])
    held = [policy._lock, one._lock, rl._lists_lock, integrator._session_keys._lock]
    for lock in held:
        lock.acquire()
    try:
        pid = os.fork()
        if pid == 0:
            free = [policy._lock, one._lock, rl._lists_lock, integrator._session_keys._lock]
            os._exit(0 if all(lock.acquire(timeout=1) for lock in free) else 1)
        _, status = os.waitpid(pid, 0)
        assert os.WEXITSTATUS(status) == 0
    finally:
        for lock in held:
            lock.release()


# ─── what warming reports ────────────────────────────────────────────────


@respx.mock
def test_warm_session_says_what_it_fetched_then_what_it_kept(fresh_key_sets: None) -> None:
    v = _rh_vector()
    _serve_everything_verify_session_reads(v)
    rl, policy = _revocations(), SignInPolicy("pk_test_tv")
    first = warm_session(v["audience"], revocations=rl, policy=policy)
    assert first.ok and first.failures() == []
    assert (first.keys.state, first.policy and first.policy.state, first.lists[v["audience"]].state) == (
        "fetched", "fetched", "fetched",
    )
    again = warm_session(v["audience"], revocations=rl, policy=policy)
    assert (again.keys.state, again.policy and again.policy.state, again.lists[v["audience"]].state) == (
        "kept", "kept", "kept",
    )


@respx.mock
def test_warm_session_names_each_failure_and_why(fresh_key_sets: None) -> None:
    respx.get("https://ochk.io/.well-known/jwks.json").mock(return_value=httpx.Response(503))
    respx.get("https://me.ochk.io/api/integrator/pk_test_tv/sign-in").mock(return_value=httpx.Response(404))
    respx.get(R["request"]["url"]).mock(return_value=httpx.Response(403, json={"ok": False, "error": "domain_unverified"}))
    result = warm_session(R["request"]["aud"], revocations=_revocations(), policy=SignInPolicy("pk_test_tv"))
    assert not result.ok
    assert result.failures() == [
        "key set: HTTP 503",
        "sign-in rule: unknown_project_key",
        f"list for {R['request']['aud']}: HTTP 403 domain_unverified",
    ]


@respx.mock
def test_warm_session_reports_a_failed_refresh_while_the_last_copy_still_answers(
    fresh_key_sets: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    respx.get(SIGN_IN).mock(side_effect=[httpx.Response(200, json={"ok": True, "require_bond": None}), httpx.Response(503)])
    respx.get("https://ochk.io/.well-known/jwks.json").mock(return_value=httpx.Response(200, json=V["session"]["jwks"]))
    policy = SignInPolicy("pk_test_tv")
    assert warm_session("https://soniq.example", policy=policy).ok
    _move_to(monkeypatch, V["now"] + 61)
    later = warm_session("https://soniq.example", policy=policy)
    assert later.policy is not None and later.policy.state == "failed"
    assert later.failures() == ["sign-in rule: HTTP 503"]
    assert policy.requirement() is None  # the rule read a minute ago still stands


@respx.mock
def test_warm_session_reports_a_list_too_old_to_vouch(fresh_key_sets: None, monkeypatch: pytest.MonkeyPatch) -> None:
    respx.get("https://ochk.io/.well-known/jwks.json").mock(return_value=httpx.Response(200, json=V["session"]["jwks"]))
    respx.get(R["request"]["url"]).mock(return_value=httpx.Response(200, json=R["lists"][R["request"]["aud"]]))
    _move_to(monkeypatch, V["now"] + 11 * 60)
    result = warm_session(R["request"]["aud"], revocations=_revocations())
    part = result.lists[R["request"]["aud"]]
    assert part.state == "failed" and part.reason is not None and "ten minutes" in part.reason


# ─── a wall clock set back ───────────────────────────────────────────────


class _Clocks:
    """A wall clock and a monotonic one that the test moves separately."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self.wall = float(V["now"])
        self.mono = 1000.0
        monkeypatch.setattr(integrator.time, "time", lambda: self.wall)
        monkeypatch.setattr(integrator, "_clock", lambda: self.mono, raising=False)

    def step_back(self, seconds: float) -> None:
        self.wall -= seconds

    def run(self, seconds: float) -> None:
        self.wall += seconds
        self.mono += seconds

    def pause(self, seconds: float) -> None:
        """A suspended host: the wall clock moves on, the monotonic one does not."""
        self.wall += seconds


@respx.mock
def test_a_wall_clock_set_back_does_not_let_the_last_rule_stand_past_ten_minutes(monkeypatch: pytest.MonkeyPatch) -> None:
    clocks = _Clocks(monkeypatch)
    respx.get(SIGN_IN).mock(side_effect=[httpx.Response(200, json={"ok": True, "require_bond": None})] + [httpx.Response(503)] * 3)
    policy = SignInPolicy("pk_test_tv")
    assert policy.requirement() is None
    clocks.step_back(3600)
    clocks.run(10 * 60 + 1)
    with pytest.raises(InvalidSession) as err:
        policy.requirement()
    assert err.value.reason == "bond_policy_unavailable"


@respx.mock
def test_a_wall_clock_set_back_does_not_extend_the_wait_before_reading_the_rule_again(monkeypatch: pytest.MonkeyPatch) -> None:
    clocks = _Clocks(monkeypatch)
    route = respx.get(SIGN_IN).mock(return_value=httpx.Response(503))
    policy = SignInPolicy("pk_test_tv")
    with pytest.raises(InvalidSession):
        policy.requirement()
    clocks.step_back(3600)
    clocks.run(10.001)
    with pytest.raises(InvalidSession):
        policy.requirement()
    assert route.call_count == 2


@respx.mock
def test_the_wait_after_a_failed_rule_read_counts_from_the_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    clocks = _Clocks(monkeypatch)

    def slow_failure(request: httpx.Request) -> httpx.Response:
        clocks.run(4)  # the read takes four seconds to fail
        return httpx.Response(503)

    route = respx.get(SIGN_IN).mock(side_effect=slow_failure)
    policy = SignInPolicy("pk_test_tv")
    with pytest.raises(InvalidSession):
        policy.requirement()
    clocks.run(6)  # ten seconds after the read began, six after it failed
    with pytest.raises(InvalidSession):
        policy.requirement()
    assert route.call_count == 1
    clocks.run(4.001)
    with pytest.raises(InvalidSession):
        policy.requirement()
    assert route.call_count == 2


@respx.mock
def test_a_wall_clock_set_back_does_not_keep_a_revocation_list_past_its_minute_or_its_wait(monkeypatch: pytest.MonkeyPatch) -> None:
    clocks = _Clocks(monkeypatch)
    route = respx.get(R["request"]["url"]).mock(side_effect=[
        httpx.Response(200, json=R["lists"][R["request"]["aud"]]),
        httpx.Response(503),
        httpx.Response(503),
    ])
    rl = _revocations()
    rl.status("x", R["request"]["aud"], 0)
    clocks.step_back(3600)
    clocks.run(61)
    rl.status("x", R["request"]["aud"], 0)
    assert route.call_count == 2
    clocks.step_back(3600)
    clocks.run(10.001)
    rl.status("x", R["request"]["aud"], 0)
    assert route.call_count == 3


@respx.mock
def test_a_wall_clock_set_back_does_not_make_a_kept_list_look_younger(monkeypatch: pytest.MonkeyPatch) -> None:
    clocks = _Clocks(monkeypatch)
    body = {"v": 1, "at": V["now"], "tokens": [], "accounts": {}, "handles": {}}
    respx.get(R["request"]["url"]).mock(side_effect=[httpx.Response(200, json=body)] + [httpx.Response(503)] * 5)
    rl = _revocations()
    assert rl.status("x", R["request"]["aud"], 0) == "live"
    # Five minutes back on the wall, eleven on: by its own time the list is now
    # eleven minutes old, and the step back must not make it look six.
    clocks.step_back(5 * 60)
    clocks.run(11 * 60)
    assert rl.status("x", R["request"]["aud"], 0) == "unverified"


@respx.mock
def test_a_wall_clock_set_back_does_not_extend_the_wait_before_fetching_the_key_set_again(
    fresh_key_sets: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    clocks = _Clocks(monkeypatch)
    route = respx.get("https://ochk.io/.well-known/jwks.json").mock(
        side_effect=[httpx.Response(200, json=V["session"]["jwks"])] + [httpx.Response(503)] * 3
    )
    kid = V["session"]["jwks"]["keys"][0]["kid"]
    keys = integrator._session_keys
    assert keys.get(kid) is not None
    clocks.run(3600)
    assert keys.get(kid) is not None  # the hourly refresh fails; the keys held still answer
    assert route.call_count == 2
    clocks.step_back(3 * 3600)
    clocks.run(10.001)
    keys.get(kid)
    assert route.call_count == 3


# ─── a pause the monotonic clock slept through ───────────────────────────


@respx.mock
def test_after_a_pause_the_list_is_read_again_and_a_session_ended_during_it_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    clocks = _Clocks(monkeypatch)
    ended: dict[str, float] = {}
    route = respx.get(R["request"]["url"]).mock(side_effect=lambda request: httpx.Response(200, json={
        "v": 1, "at": clocks.wall, "tokens": [], "accounts": {}, "handles": dict(ended),
    }))
    rl = _revocations()
    assert rl.status("rh-1", R["request"]["aud"], V["now"] - 60) == "live"
    ended["rh-1"] = V["now"]
    clocks.pause(3 * 3600)
    assert rl.status("rh-1", R["request"]["aud"], V["now"] - 60) == "revoked"
    assert route.call_count == 2


@respx.mock
def test_after_a_pause_a_list_from_before_it_cannot_vouch(monkeypatch: pytest.MonkeyPatch) -> None:
    clocks = _Clocks(monkeypatch)
    respx.get(R["request"]["url"]).mock(side_effect=[
        httpx.Response(200, json={"v": 1, "at": V["now"], "tokens": [], "accounts": {}, "handles": {}}),
    ] + [httpx.Response(503)] * 3)
    rl = _revocations()
    assert rl.status("x", R["request"]["aud"], 0) == "live"
    clocks.pause(3 * 3600)
    assert rl.status("x", R["request"]["aud"], 0) == "unverified"


@respx.mock
def test_after_a_pause_the_rule_is_read_again_or_stops_standing(monkeypatch: pytest.MonkeyPatch) -> None:
    clocks = _Clocks(monkeypatch)
    respx.get(SIGN_IN).mock(side_effect=[
        httpx.Response(200, json={"ok": True, "require_bond": None}),
        httpx.Response(200, json={"ok": True, "require_bond": {"min_sats": 100000, "min_days": 0}}),
        httpx.Response(503),
        httpx.Response(503),
    ])
    policy = SignInPolicy("pk_test_tv")
    assert policy.requirement() is None
    clocks.pause(3 * 3600)
    assert policy.requirement() == {"min_sats": 100000, "min_days": 0}
    clocks.pause(3 * 3600)
    with pytest.raises(InvalidSession) as err:
        policy.requirement()
    assert err.value.reason == "bond_policy_unavailable"


@respx.mock
def test_a_pause_does_not_stretch_the_wait_before_reading_the_rule_again(monkeypatch: pytest.MonkeyPatch) -> None:
    clocks = _Clocks(monkeypatch)
    route = respx.get(SIGN_IN).mock(return_value=httpx.Response(503))
    policy = SignInPolicy("pk_test_tv")
    with pytest.raises(InvalidSession):
        policy.requirement()
    clocks.pause(11)
    with pytest.raises(InvalidSession):
        policy.requirement()
    assert route.call_count == 2


@respx.mock
def test_after_a_pause_the_key_set_is_fetched_again_and_a_dropped_key_is_gone(
    fresh_key_sets: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    clocks = _Clocks(monkeypatch)
    route = respx.get("https://ochk.io/.well-known/jwks.json").mock(
        side_effect=[httpx.Response(200, json=V["session"]["jwks"])] + [httpx.Response(200, json={"keys": []})] * 2
    )
    kid = V["session"]["jwks"]["keys"][0]["kid"]
    assert integrator._session_keys.get(kid) is not None
    clocks.pause(2 * 3600)
    assert integrator._session_keys.get(kid) is None
    assert route.call_count == 3  # the hourly read, then the read for a key it no longer has


@respx.mock
def test_a_list_dated_ahead_vouches_once_a_lagging_clock_catches_up(monkeypatch: pytest.MonkeyPatch) -> None:
    clocks = _Clocks(monkeypatch)
    respx.get(R["request"]["url"]).mock(return_value=httpx.Response(200, json={
        "v": 1, "at": V["now"] + 90, "tokens": [], "accounts": {}, "handles": {},
    }))
    rl = _revocations()
    assert rl.status("x", R["request"]["aud"], 0) == "unverified"
    # NTP steps the wall clock forward 31 s; the copy is still inside its minute.
    clocks.wall += 31
    clocks.mono += 1
    assert rl.status("x", R["request"]["aud"], 0) == "live"
