"""
Native sign-in, the server's half (ochk.io/docs/integration/native-sign-in): an app on a
person's own device, a desktop build or a game, signs them in through the
system browser. It listens on 127.0.0.1, opens ochk.io's /native/authorize
with a PKCE challenge, and its listener receives a one-time ``code``. It hands
the code and its verifier to your server, which trades them here for the same
token the sign-in popup gives, checked as :func:`check_oc_session` checks a
request's:

    from orangecheck import RevocationList, exchange_native_code, spend_once

    revocations = RevocationList(os.environ["OC_PROJECT_KEY"], os.environ["OC_SIGNING_SECRET"])

    got = exchange_native_code(code, code_verifier, redirect_uri, "https://your-site.example",
                               project_key=os.environ["OC_PROJECT_KEY"], revocations=revocations)
    if got.status == "valid" and spend_once(got.session.jti, got.session.exp, store):
        start_my_own_session(got.session)

``valid`` means the token verifies for your audience, carries its handle, was
not ended everywhere, and the account meets your project's "who can sign in"
rule. No secret is involved in the app: the verifier proves the app that
started the sign-in is the one finishing it. Only a mistake in the call
raises. The same call and results as ``exchangeNativeCode`` in
``@orangecheck/me-client/server``, held to
``me-client/test-vectors/server-helpers.json``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Mapping, Optional, Union

import httpx

from .integrator import (
    SESSION_ISSUER,
    BondRequired,
    InvalidSession,
    RevocationList,
    Session,
    SessionEnded,
    _issuer_origin,
    _policy_for,
    verify_session,
)

_DEFAULT_TIMEOUT = 5.0
_MAX_TIMEOUT = 30.0
_MAX_FIELD_LENGTH = 512
_UNAVAILABLE = frozenset({"key_set_unavailable", "revocations_unavailable", "bond_policy_unavailable"})


@dataclass(frozen=True)
class NativeSignIn:
    """The token ochk.io issued for the code, and its session, checked for your audience
    and your project's rule. A token from native sign-in carries ``azp: "native"``
    (``session.claims["azp"]``)."""

    token: str
    session: Session
    status: Literal["valid"] = "valid"


@dataclass(frozen=True)
class NativeRefusal:
    """No session. ``invalid``: ``invalid_grant`` (the code is unknown, spent or
    expired, was sent with another verifier, redirect or project, or the project no
    longer allows native sign-in: start again), ``not_offered`` (this auth host does
    not offer native sign-in), ``bad_request``, ``invalid_token`` /
    ``no_session_handle`` (the token did not verify for your audience),
    ``session_ended`` (the person ended their sessions everywhere),
    ``bond_required`` (the account does not meet your project's rule: ``need``,
    ``have`` and ``back_url`` say what it asks and where to back the account), or
    ``unknown_project_key``. ``unavailable``: ``auth_host_unavailable``,
    ``rate_limited``, ``key_set_unavailable``, ``revocations_unavailable`` or
    ``bond_policy_unavailable``; answer it 503."""

    status: Literal["invalid", "unavailable"]
    reason: str
    need: Optional[dict[str, int]] = None
    have: Optional[dict[str, int]] = None
    back_url: Optional[str] = None


def exchange_native_code(
    code: str,
    code_verifier: str,
    redirect_uri: str,
    audience: str,
    *,
    project_key: str,
    issuer: str = SESSION_ISSUER,
    me_origin: str = "https://me.ochk.io",
    revocations: Optional[RevocationList] = None,
    require_bond: Optional[Mapping[str, Any]] = None,
    timeout: float = _DEFAULT_TIMEOUT,
) -> Union[NativeSignIn, NativeRefusal]:
    """
    Trade a native sign-in's code for its token (``POST <issuer>/api/auth/native/token``),
    then check it as :func:`check_oc_session` does a request's: verified for
    ``audience`` (your site's origin, the project's verified domain or a test
    project's development origin, never taken from ochk.io's answer), not ended
    everywhere on ``revocations`` (the trade counts as a write), and meeting your
    project's rule, read with ``project_key`` as :func:`check_sign_in_rule` reads
    it. ``project_key`` is your own key, from your config, never from the request:
    it decides whose rule and list of ended sessions apply. ``require_bond`` sets
    the floor yourself, and wins. ``redirect_uri`` is exactly what the app sent.
    Each code works once, whatever the answer. Start your own session only on
    ``valid``. An outage is a result, never an exception.
    """
    fields = {
        "code": code,
        "code_verifier": code_verifier,
        "redirect_uri": redirect_uri,
        "audience": audience,
        "project_key": project_key,
    }
    for name, value in fields.items():
        if not isinstance(value, str) or not 0 < len(value) <= _MAX_FIELD_LENGTH:
            raise ValueError(
                f"exchange_native_code: {name} must be a non-empty string of at most {_MAX_FIELD_LENGTH} characters"
            )
    if audience == "*":
        raise ValueError("exchange_native_code: audience must be your site's origin, not '*'")
    if revocations is not None and not isinstance(revocations, RevocationList):
        raise TypeError("exchange_native_code: revocations must be a RevocationList")
    try:
        origin = _issuer_origin(issuer)
    except ValueError as err:
        raise ValueError(f"exchange_native_code: {err}") from err
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 0 < timeout <= _MAX_TIMEOUT:
        raise ValueError(f"exchange_native_code: timeout must be above 0 and at most {_MAX_TIMEOUT:g} seconds")
    policy = _policy_for(project_key, me_origin)

    unavailable = NativeRefusal("unavailable", "auth_host_unavailable")
    try:
        resp = httpx.post(
            origin + "/api/auth/native/token",
            json={
                "grant_type": "authorization_code",
                "code": code,
                "code_verifier": code_verifier,
                "redirect_uri": redirect_uri,
                "project": project_key,
            },
            headers={"Content-Type": "application/json"},
            timeout=timeout,
            # The endpoint never redirects: the code goes to the auth host and nowhere else.
            follow_redirects=False,
        )
    except httpx.HTTPError:
        return unavailable
    try:
        body = resp.json()
    except ValueError:
        body = None
    if not isinstance(body, dict):
        body = {}
    if resp.status_code == 400:
        return NativeRefusal("invalid", "invalid_grant" if body.get("reason") == "invalid_grant" else "bad_request")
    if resp.status_code == 404:
        return NativeRefusal("invalid", "not_offered")
    if resp.status_code == 429:
        return NativeRefusal("unavailable", "rate_limited")
    token = body.get("token")
    if resp.status_code != 200 or body.get("ok") is not True or not isinstance(token, str) or not token:
        return unavailable
    try:
        # The trade starts a session, so it counts as a write.
        session = verify_session(
            token, audience, issuer=issuer, revocations=revocations, method="POST", require_bond=require_bond, policy=policy
        )
    except BondRequired as err:
        return NativeRefusal("invalid", "bond_required", need=dict(err.need), have=err.have, back_url=err.back_url)
    except SessionEnded:
        return NativeRefusal("invalid", "session_ended")
    except InvalidSession as err:
        if err.reason in _UNAVAILABLE:
            return NativeRefusal("unavailable", err.reason)
        if err.reason in ("no_session_handle", "unknown_project_key"):
            return NativeRefusal("invalid", err.reason)
        return NativeRefusal("invalid", "invalid_token")
    return NativeSignIn(token=token, session=session)
