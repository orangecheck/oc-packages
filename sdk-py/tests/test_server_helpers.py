"""
A site's own backend: what it answers for a sign-in token, spending a token's
jti once, and ending a token at ochk.io.

``me-client/test-vectors/server-helpers.json`` is read here and by me-client's
``src/__tests__/server-helpers.test.ts``, so a Python site and a Node site give
the same HTTP answer, spend the same tokens and read ochk.io's answers alike.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import httpx
import pytest
import respx

import orangecheck.integrator as integrator
import orangecheck.tokens as tokens
from orangecheck import (
    InvalidSession,
    MemoryJtiStore,
    RevocationList,
    RevokeRefusal,
    SessionCheck,
    SignInPolicy,
    TokensRevoked,
    check_oc_session,
    check_sign_in_rule,
    revoke_token,
    spend_once,
    verify_session,
    warm_session,
)

ROOT = Path(__file__).resolve().parents[2] / "me-client" / "test-vectors"
H: dict[str, Any] = json.loads((ROOT / "server-helpers.json").read_text())
V: dict[str, Any] = json.loads((ROOT / "integrator.json").read_text())


def _move_to(monkeypatch: pytest.MonkeyPatch, t: float) -> None:
    for mod in (integrator, tokens):
        monkeypatch.setattr(mod.time, "time", lambda: float(t))
    monkeypatch.setattr(integrator, "_clock", lambda: float(t), raising=False)


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    _move_to(monkeypatch, H["now"])
    monkeypatch.setattr(integrator, "_session_keys", integrator._KeySet(integrator.SESSION_JWKS_URL))
    monkeypatch.setattr(integrator, "_issuer_keys", {})
    monkeypatch.setattr(integrator, "_policies", {})


def _token(ref: Optional[list[str]]) -> Optional[str]:
    if ref is None:
        return None
    section, kind, name = ref
    return next(v["token"] for v in V[section][kind] if v["name"] == name)


def _expand(value: Any) -> Any:
    if isinstance(value, dict) and "repeat" in value:
        return [value["of"]] * value["count"] if value["repeat"] == "list" else value["of"] * value["count"]
    return value


def _response(answer: dict[str, Any]) -> httpx.Response:
    body = answer["body"]
    if isinstance(body, str):
        return httpx.Response(answer["status"], text=body)
    return httpx.Response(answer["status"], json=body)


# ─── check_oc_session: one request's answer ──────────────────────────────


@respx.mock
@pytest.mark.parametrize("c", H["check"]["cases"], ids=lambda c: c["name"])
def test_check_answers_as_the_node_adapters_do(c: dict[str, Any]) -> None:
    jwks = c.get("jwks", {"status": 200, "body": V["session"]["jwks"]})
    respx.get("https://ochk.io/.well-known/jwks.json").mock(return_value=_response(jwks))
    if "list" in c:
        respx.get(url__startswith="https://me.ochk.io/api/integrator/revocations").mock(return_value=_response(c["list"]))
    if "policy" in c:
        respx.get(f"https://me.ochk.io/api/integrator/{c['project_key']}/sign-in").mock(return_value=_response(c["policy"]))
    kwargs: dict[str, Any] = {"method": c["method"]}
    if "list" in c:
        kwargs["revocations"] = RevocationList(H["check"]["project_key"], H["check"]["secret"])
    if "policy" in c:
        kwargs["policy"] = SignInPolicy(c["project_key"])
    if "require_bond" in c:
        kwargs["require_bond"] = c["require_bond"]
    got = check_oc_session(_token(c["token"]), c["audience"], **kwargs)
    assert isinstance(got, SessionCheck)
    assert got.status == c["expect"]["status"]
    if got.status == 200:
        assert got.ok and got.session is not None and got.body is None
    else:
        assert not got.ok and got.session is None
        assert got.body == c["expect"]["body"]


def test_check_takes_only_what_verify_session_takes() -> None:
    with pytest.raises(TypeError):
        check_oc_session("a.b.c", "https://soniq.example", audiences=["x"])  # type: ignore[call-arg]


# ─── check_sign_in_rule: the rule for a session the site verified ────────


def _claims(ref: list[str]) -> dict[str, Any]:
    section, kind, name = ref
    return dict(next(v["claims"] for v in V[section][kind] if v["name"] == name))


@respx.mock
@pytest.mark.parametrize("c", H["sign_in_rule"]["cases"], ids=lambda c: c["name"])
def test_sign_in_rule_answers_as_me_client_does(c: dict[str, Any]) -> None:
    route = respx.get(f"https://me.ochk.io/api/integrator/{c['project_key']}/sign-in").mock(
        return_value=_response(c["policy"])
    )
    kwargs: dict[str, Any] = {"project_key": c["project_key"]}
    if "require_bond" in c:
        kwargs["require_bond"] = c["require_bond"]
    got = check_sign_in_rule(_claims(c["session"]), **kwargs)
    assert isinstance(got, SessionCheck)
    assert got.status == c["expect"]["status"]
    if got.status == 200:
        assert got.ok and got.body is None
    else:
        assert not got.ok and got.body == c["expect"]["body"]
    # An explicit floor wins: the project's rule is never read.
    if "require_bond" in c:
        assert route.call_count == 0


@respx.mock
@pytest.mark.parametrize("r", H["sign_in_rule"]["refused"], ids=lambda r: r["name"])
def test_sign_in_rule_refuses_a_mistake_in_the_call(r: dict[str, Any]) -> None:
    session = _claims(r["session"]) if r["session"] else None
    with pytest.raises(TypeError):
        check_sign_in_rule(session, **r["options"])  # type: ignore[arg-type]


def test_sign_in_rule_takes_one_project() -> None:
    session = _claims(["session", "valid", "bound to this site"])
    with pytest.raises(TypeError):
        check_sign_in_rule(session, project_key="pk_test_srule_a", policy=SignInPolicy("pk_test_srule_b"))
    with pytest.raises(TypeError):
        check_sign_in_rule(session, project_key="")


@respx.mock
def test_sign_in_rule_reads_the_rule_once_a_minute(monkeypatch: pytest.MonkeyPatch) -> None:
    route = respx.get("https://me.ochk.io/api/integrator/pk_test_srule_cache/sign-in").mock(
        return_value=httpx.Response(200, json={"ok": True, "require_bond": None})
    )
    session = _claims(["session", "valid", "bound to this site"])
    assert check_sign_in_rule(session, project_key="pk_test_srule_cache").ok
    assert check_sign_in_rule(session, project_key="pk_test_srule_cache").ok
    assert route.call_count == 1
    _move_to(monkeypatch, H["now"] + 61)
    assert check_sign_in_rule(session, project_key="pk_test_srule_cache").ok
    assert route.call_count == 2


@respx.mock
def test_sign_in_rule_takes_a_policy_or_a_verified_session() -> None:
    respx.get("https://me.ochk.io/api/integrator/pk_test_srule_obj/sign-in").mock(
        return_value=httpx.Response(200, json={"ok": True, "require_bond": {"min_sats": 10000, "min_days": 0}})
    )
    v = next(v for v in V["session"]["valid"] if v["name"] == "bound to this site")
    session = verify_session(v["token"], v["audience"], jwks=V["session"]["jwks"])
    got = check_sign_in_rule(session, policy=SignInPolicy("pk_test_srule_obj"))
    assert (got.status, got.body["reason"] if got.body else None) == (403, "bond_required")


# ─── spend_once ──────────────────────────────────────────────────────────


def test_spend_once_answers_each_step_on_one_store(monkeypatch: pytest.MonkeyPatch) -> None:
    store = MemoryJtiStore()
    for s in H["spend_once"]["steps"]:
        _move_to(monkeypatch, s["now"])
        assert spend_once(s["jti"], s["exp"], store) is s["spent"], s["name"]


class _Counting:
    def __init__(self, answer: Any = True) -> None:
        self.calls: list[tuple[str, Any]] = []
        self.answer = answer

    def add(self, jti: str, exp: Any) -> Any:
        self.calls.append((jti, exp))
        return self.answer


@pytest.mark.parametrize("s", H["spend_once"]["refused"], ids=lambda s: s["name"])
def test_spend_once_refuses_a_call_that_cannot_be_right(s: dict[str, Any]) -> None:
    store = _Counting()
    with pytest.raises(TypeError, match="spend_once"):
        spend_once(s["jti"], s["exp"], store)
    assert store.calls == []


def test_spend_once_never_asks_the_store_about_an_expired_token() -> None:
    store = _Counting()
    assert spend_once("jti-x", H["now"] - 1, store) is False
    assert store.calls == []


def test_spend_once_fails_closed_on_a_store_answer_that_is_not_a_bool() -> None:
    with pytest.raises(TypeError, match="True or False"):
        spend_once("jti-1", H["now"] + 60, _Counting(answer="yes"))

    class Down:
        def add(self, jti: str, exp: int) -> bool:
            raise RuntimeError("db down")

    with pytest.raises(RuntimeError, match="db down"):
        spend_once("jti-1", H["now"] + 60, Down())


def test_spend_once_needs_a_store() -> None:
    with pytest.raises(TypeError, match="spend_once"):
        spend_once("jti-1", H["now"] + 60, object())  # type: ignore[arg-type]


# ─── revoke_token ────────────────────────────────────────────────────────


@respx.mock
@pytest.mark.parametrize("r", H["revoke"]["requests"], ids=lambda r: r["name"])
def test_revoke_sends_what_the_node_sdk_sends(r: dict[str, Any]) -> None:
    route = respx.post(H["revoke"]["url"]).mock(return_value=httpx.Response(200, json={"ok": True, "revoked": 1}))
    revoke_token(_expand(r["input"]))
    assert route.call_count == 1
    sent = route.calls.last.request
    assert sent.headers["content-type"] == "application/json"
    assert json.loads(sent.content) == {"tokens": _expand(r["body"]["tokens"])}


@respx.mock
@pytest.mark.parametrize("r", H["revoke"]["refused"], ids=lambda r: r["name"])
def test_revoke_refuses_before_sending(r: dict[str, Any]) -> None:
    route = respx.post(H["revoke"]["url"]).mock(return_value=httpx.Response(200, json={"ok": True, "revoked": 1}))
    with pytest.raises(ValueError, match="revoke_token"):
        revoke_token(_expand(r["input"]))
    assert route.call_count == 0


@respx.mock
@pytest.mark.parametrize("a", H["revoke"]["answers"], ids=lambda a: a["name"])
def test_revoke_reads_each_answer_as_the_node_sdk_does(a: dict[str, Any]) -> None:
    route = respx.post(H["revoke"]["url"])
    if a["status"] == 0:
        route.mock(side_effect=httpx.ConnectError("no route"))
    elif 300 <= a["status"] < 400:
        route.mock(return_value=httpx.Response(a["status"], headers={"Location": "https://elsewhere.example/"}))
    else:
        route.mock(return_value=_response(a))
    got = revoke_token("a.b.c")
    want = a["result"]
    if want["ok"]:
        assert got == TokensRevoked(revoked=want["revoked"])
    else:
        assert got == RevokeRefusal(reason=want["reason"], status=want["status"])
    assert got.ok is want["ok"]


@respx.mock
def test_revoke_goes_to_the_issuer_named_and_only_an_https_one() -> None:
    a = respx.post("https://oc-www-test.vercel.app/api/auth/revoke").mock(
        return_value=httpx.Response(200, json={"ok": True, "revoked": 1})
    )
    b = respx.post("http://localhost:3000/api/auth/revoke").mock(
        return_value=httpx.Response(200, json={"ok": True, "revoked": 1})
    )
    revoke_token("a.b.c", issuer="https://oc-www-test.vercel.app/")
    revoke_token("a.b.c", issuer="http://localhost:3000")
    assert (a.call_count, b.call_count) == (1, 1)
    for bad in ("http://ochk.io", "not a url", "ftp://ochk.io"):
        with pytest.raises(ValueError, match="issuer"):
            revoke_token("a.b.c", issuer=bad)
    for timeout in (0, 30.5, True):
        with pytest.raises(ValueError, match="timeout"):
            revoke_token("a.b.c", timeout=timeout)  # type: ignore[arg-type]


# ─── warm_session and verify_session: issuer and jwks ────────────────────


ISSUER = "https://issuer.example"


@respx.mock
def test_issuer_moves_the_key_fetch_to_its_own_key_set() -> None:
    own = respx.get(f"{ISSUER}/.well-known/jwks.json").mock(return_value=httpx.Response(200, json=V["session"]["jwks"]))
    ochk = respx.get("https://ochk.io/.well-known/jwks.json").mock(return_value=httpx.Response(200, json={"keys": []}))
    v = V["session"]["valid"][0]
    # The vector token says iss https://ochk.io: fetched from the issuer named, then refused on iss.
    with pytest.raises(InvalidSession) as err:
        verify_session(v["token"], v["audience"], issuer=ISSUER)
    assert err.value.reason == "issuer"
    assert (own.call_count, ochk.call_count) == (1, 0)


@respx.mock
def test_issuer_with_a_trailing_slash_fetches_the_same_key_set() -> None:
    own = respx.get(f"{ISSUER}/.well-known/jwks.json").mock(return_value=httpx.Response(200, json=V["session"]["jwks"]))
    v = V["session"]["valid"][0]
    for iss in (ISSUER, ISSUER + "/"):
        with pytest.raises(InvalidSession):
            verify_session(v["token"], v["audience"], issuer=iss)
    assert own.call_count == 1


@respx.mock
def test_jwks_given_wins_over_the_issuers_key_set() -> None:
    route = respx.get(url__startswith=ISSUER).mock(return_value=httpx.Response(500))
    v = V["session"]["valid"][0]
    assert verify_session(v["token"], v["audience"], jwks=V["session"]["jwks"]).did_oc == v["claims"]["did_oc"]
    assert route.call_count == 0


def test_an_issuer_fetched_over_plain_http_is_refused_unless_on_this_machine() -> None:
    v = V["session"]["valid"][0]
    with pytest.raises(ValueError, match="https"):
        verify_session(v["token"], v["audience"], issuer="http://issuer.example")
    # Offline, with the key set given, nothing is fetched, so any issuer is taken.
    with pytest.raises(InvalidSession) as err:
        verify_session(v["token"], v["audience"], issuer="http://issuer.example", jwks=V["session"]["jwks"])
    assert err.value.reason == "issuer"


@respx.mock
def test_a_local_issuer_over_http_is_fetched() -> None:
    route = respx.get("http://localhost:8000/.well-known/jwks.json").mock(
        return_value=httpx.Response(200, json=V["session"]["jwks"])
    )
    v = V["session"]["valid"][0]
    with pytest.raises(InvalidSession):
        verify_session(v["token"], v["audience"], issuer="http://localhost:8000")
    assert route.call_count == 1


@respx.mock
def test_warm_session_warms_the_issuers_key_set() -> None:
    own = respx.get(f"{ISSUER}/.well-known/jwks.json").mock(return_value=httpx.Response(200, json=V["session"]["jwks"]))
    ochk = respx.get("https://ochk.io/.well-known/jwks.json").mock(return_value=httpx.Response(200, json=V["session"]["jwks"]))
    result = warm_session("https://soniq.example", issuer=ISSUER)
    assert result.keys.state == "fetched"
    assert (own.call_count, ochk.call_count) == (1, 0)
    # And verify_session for that issuer uses the warmed copy: no second fetch.
    with pytest.raises(InvalidSession):
        verify_session(V["session"]["valid"][0]["token"], "https://soniq.example", issuer=ISSUER)
    assert own.call_count == 1


@respx.mock
def test_warm_session_with_a_key_set_given_fetches_none() -> None:
    route = respx.get(url__startswith="https://").mock(return_value=httpx.Response(500))
    result = warm_session("https://soniq.example", jwks=V["session"]["jwks"])
    assert result.keys.state == "kept" and result.ok
    assert route.call_count == 0


def test_warm_session_refuses_an_issuer_over_plain_http() -> None:
    result = warm_session("https://soniq.example", issuer="http://issuer.example")
    assert result.keys.state == "failed"
    assert "https" in (result.keys.reason or "")


# ─── RevocationList: one non-empty string each ───────────────────────────


@pytest.mark.parametrize(
    "key, secret",
    [("", "s3cret"), ("pk_test_tv", ""), ("   ", "s3cret"), ("pk_test_tv", " \t"), (None, "s3cret"), ("pk_test_tv", 7)],
)
def test_revocation_list_needs_one_non_empty_string_for_key_and_secret(key: Any, secret: Any) -> None:
    with pytest.raises(ValueError, match="one non-empty string"):
        RevocationList(key, secret)


def test_revocation_list_takes_a_key_and_secret() -> None:
    assert RevocationList("pk_test_tv", "s3cret").status(None, None, None) == "live"


# ─── review follow-ups ───────────────────────────────────────────────────


@respx.mock
def test_an_unknown_kid_while_the_key_set_cannot_be_read_is_an_outage() -> None:
    # A key may have rotated in while ochk.io was unreachable: that is "can't tell", not a bad token.
    route = respx.get("https://ochk.io/.well-known/jwks.json").mock(
        side_effect=[httpx.Response(200, json=V["session"]["jwks"]), httpx.Response(503), httpx.Response(200, json=V["session"]["jwks"])]
    )
    valid = V["session"]["valid"][0]
    unknown = next(v for v in V["session"]["invalid"] if v["name"] == "kid not in the set")
    assert verify_session(valid["token"], valid["audience"]).did_oc
    got = check_oc_session(unknown["token"], unknown["audience"], method="GET")
    assert (got.status, got.body) == (503, {"ok": False, "reason": "key_set_unavailable"})
    # Once a fetch succeeds again, the same kid is a token the set does not know.
    integrator._session_keys._forced_at = float("-inf")
    integrator._session_keys._forced_wall = float("-inf")
    with pytest.raises(InvalidSession) as err:
        verify_session(unknown["token"], unknown["audience"])
    assert err.value.reason == "unknown_key"
    assert route.call_count == 3


@pytest.mark.parametrize(
    "bad",
    ["https://ochk.io/#", "https://ochk.io?x", "https://ochk.io/path", "https://u:p@ochk.io", "https://ochk.io\\@evil.example"],
)
def test_an_issuer_is_one_origin_and_nothing_else(bad: str) -> None:
    v = V["session"]["valid"][0]
    with pytest.raises(ValueError, match="issuer"):
        verify_session(v["token"], v["audience"], issuer=bad)
    with pytest.raises(ValueError, match="issuer"):
        revoke_token("a.b.c", issuer=bad)


@respx.mock
def test_an_issuer_with_a_trailing_slash_is_the_same_issuer() -> None:
    respx.get("https://ochk.io/.well-known/jwks.json").mock(return_value=httpx.Response(200, json=V["session"]["jwks"]))
    v = V["session"]["valid"][0]
    assert verify_session(v["token"], v["audience"], issuer="https://ochk.io/").did_oc == v["claims"]["did_oc"]
    assert check_oc_session(v["token"], v["audience"], issuer="https://ochk.io/", method="GET").ok


def test_spend_once_async_takes_an_async_store_or_a_sync_one(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    from orangecheck import spend_once_async

    class AsyncStore:
        def __init__(self) -> None:
            self.inner = MemoryJtiStore()

        async def add(self, jti: str, exp: int) -> bool:
            return self.inner.add(jti, exp)

    for store in (AsyncStore(), MemoryJtiStore()):
        for s in H["spend_once"]["steps"]:
            _move_to(monkeypatch, s["now"])
            assert asyncio.run(spend_once_async(s["jti"], s["exp"], store)) is s["spent"], s["name"]
        _move_to(monkeypatch, H["now"])
    for s in H["spend_once"]["refused"]:
        with pytest.raises(TypeError, match="spend_once"):
            asyncio.run(spend_once_async(s["jti"], s["exp"], MemoryJtiStore()))
