"""
Native sign-in, the server's half (ochk.io/docs/integration/native-sign-in): an app on a
person's own device, a desktop build or a game, signs them in through the
system browser. It listens on 127.0.0.1, opens ochk.io's /native/authorize
with a PKCE challenge, and its listener receives a one-time ``code``. It hands
the code and its verifier to your server, which trades them here for the same
token the sign-in popup gives, verified:

    from orangecheck import exchange_native_code, spend_once

    got = exchange_native_code(code, code_verifier, redirect_uri, "pk_test_…", "https://your-site.example")
    if got.status == "valid" and spend_once(got.session.jti, got.session.exp, store):
        start_my_own_session(got.session)

No secret is involved anywhere: the verifier proves the app that started the
sign-in is the one finishing it. Only a mistake in the call raises. The same
call and results as ``exchangeNativeCode`` in ``@orangecheck/me-client/server``,
held to ``me-client/test-vectors/server-helpers.json``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Union

import httpx

from .integrator import SESSION_ISSUER, InvalidSession, Session, _issuer_origin, verify_session

_DEFAULT_TIMEOUT = 5.0
_MAX_TIMEOUT = 30.0
_MAX_FIELD_LENGTH = 512


@dataclass(frozen=True)
class NativeSignIn:
    """The token ochk.io issued for the code, and its session, verified for your audience.
    A token from native sign-in carries ``azp: "native"`` (``session.claims["azp"]``)."""

    token: str
    session: Session
    status: Literal["valid"] = "valid"


@dataclass(frozen=True)
class NativeRefusal:
    """No session. ``invalid``: ``invalid_grant`` (the code is unknown, spent or
    expired, was sent with another verifier, redirect or project, or the project no
    longer allows native sign-in: start again), ``not_offered`` (this auth host does
    not offer native sign-in), ``bad_request``, or ``invalid_token`` /
    ``no_session_handle`` (the token did not verify for your audience).
    ``unavailable``: ``auth_host_unavailable``, ``rate_limited`` or
    ``key_set_unavailable``; answer it 503."""

    status: Literal["invalid", "unavailable"]
    reason: str


def exchange_native_code(
    code: str,
    code_verifier: str,
    redirect_uri: str,
    project_key: str,
    audience: str,
    *,
    issuer: str = SESSION_ISSUER,
    timeout: float = _DEFAULT_TIMEOUT,
) -> Union[NativeSignIn, NativeRefusal]:
    """
    Trade a native sign-in's code for its token (``POST <issuer>/api/auth/native/token``),
    then verify the token for ``audience``: your site's origin, the project's verified
    domain or a test project's development origin, never taken from ochk.io's answer.
    ``redirect_uri`` is exactly what the app sent. Each code works once, whatever the
    answer. An outage is a result, never an exception.
    """
    fields = {
        "code": code,
        "code_verifier": code_verifier,
        "redirect_uri": redirect_uri,
        "project_key": project_key,
        "audience": audience,
    }
    for name, value in fields.items():
        if not isinstance(value, str) or not 0 < len(value) <= _MAX_FIELD_LENGTH:
            raise ValueError(
                f"exchange_native_code: {name} must be a non-empty string of at most {_MAX_FIELD_LENGTH} characters"
            )
    if audience == "*":
        raise ValueError("exchange_native_code: audience must be your site's origin, not '*'")
    try:
        origin = _issuer_origin(issuer)
    except ValueError as err:
        raise ValueError(f"exchange_native_code: {err}") from err
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 0 < timeout <= _MAX_TIMEOUT:
        raise ValueError(f"exchange_native_code: timeout must be above 0 and at most {_MAX_TIMEOUT:g} seconds")

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
        session = verify_session(token, audience, issuer=issuer)
    except InvalidSession as err:
        if err.reason == "key_set_unavailable":
            return NativeRefusal("unavailable", "key_set_unavailable")
        return NativeRefusal("invalid", "no_session_handle" if err.reason == "no_session_handle" else "invalid_token")
    return NativeSignIn(token=token, session=session)
