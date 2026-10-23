"""
Two things a site's own backend does with the token from the sign-in popup,
once it has verified it (ochk.io/docs/me/sdk):

    from orangecheck import spend_once, revoke_token

    if not spend_once(session.jti, session.exp, store):   # a repeat, or expired
        return refuse()
    start_my_own_session(session)
    revoke_token(token)                                  # ended at the auth host

``spend_once`` keeps a token from starting a second session; ``revoke_token``
ends it at the auth host once the site's own session has taken over. Only a
mistake in the call itself raises, before anything is read or sent. The same
calls and results as ``@orangecheck/me-client/server``, held to
``me-client/test-vectors/server-helpers.json``.
"""

from __future__ import annotations

import inspect
import math
import threading
import time
from dataclasses import dataclass
from typing import Any, Literal, Protocol, Union

import httpx

from .integrator import SESSION_ISSUER, _issuer_origin

_DEFAULT_TIMEOUT = 5.0
_MAX_TIMEOUT = 30.0
#: What the auth host's /api/auth/revoke takes in one call.
_MAX_TOKENS = 8
_MAX_TOKEN_LENGTH = 4096
_MAX_SAFE_INTEGER = 2**53 - 1


class JtiStore(Protocol):
    """
    Where you record the ``jti`` of each token you accepted, until it expires.
    Yours to provide, shared by every server that accepts sign-ins: a unique row
    in your database, or Redis ``SET jti 1 NX EXAT exp``. ``add`` must be atomic:
    True when it recorded the jti, False when the jti was there already.
    """

    def add(self, jti: str, exp: int) -> bool: ...


class MemoryJtiStore:
    """
    A :class:`JtiStore` in this process's memory: for tests and a single process.
    Two servers, or a restart, each have their own, so a token could start a
    session on each: in production, use a store they share.
    """

    def __init__(self) -> None:
        self._spent: dict[str, float] = {}
        self._lock = threading.Lock()

    def add(self, jti: str, exp: Union[int, float]) -> bool:
        now = math.floor(time.time())
        with self._lock:
            for k in [k for k, until in self._spent.items() if until <= now]:
                del self._spent[k]
            if jti in self._spent:
                return False
            self._spent[jti] = exp
            return True


def _spend_check(jti: Any, exp: Any, store: Any) -> Any:
    """The store's ``add``, once the call is right; raises TypeError otherwise."""
    if not isinstance(jti, str) or not jti:
        raise TypeError("spend_once: jti must be one non-empty string")
    if isinstance(exp, bool) or not isinstance(exp, (int, float)) or not math.isfinite(exp):
        raise TypeError("spend_once: exp must be the token's expiry, in seconds")
    add = getattr(store, "add", None)
    if not callable(add):
        raise TypeError("spend_once: store must have add(jti, exp)")
    return add


def _spent(answer: Any) -> bool:
    if not isinstance(answer, bool):
        raise TypeError("spend_once: store.add must answer True or False")
    return answer


def spend_once(jti: str, exp: Union[int, float], store: JtiStore) -> bool:
    """
    Spend a verified token's ``jti`` so it starts one session: True the first
    time, False for a repeat or a token that has expired (``exp``, in seconds, at
    or before now). Call it after verifying the token and before starting your
    own session; on False, refuse the sign-in. A store that fails raises, so the
    sign-in fails closed. With an async store, use :func:`spend_once_async`.
    """
    add = _spend_check(jti, exp, store)
    if exp <= math.floor(time.time()):
        return False
    return _spent(add(jti, exp))


async def spend_once_async(jti: str, exp: Union[int, float], store: Any) -> bool:
    """:func:`spend_once` for an async route: ``store.add`` may be a coroutine
    (redis.asyncio, an async ORM) or a plain function."""
    add = _spend_check(jti, exp, store)
    if exp <= math.floor(time.time()):
        return False
    answer = add(jti, exp)
    if inspect.isawaitable(answer):
        answer = await answer
    return _spent(answer)


@dataclass(frozen=True)
class TokensRevoked:
    """The auth host ended ``revoked`` tokens: 0 when it could not read one as its own
    (expired already, or signed elsewhere)."""

    revoked: int
    ok: Literal[True] = True


@dataclass(frozen=True)
class RevokeRefusal:
    """The auth host did not end them. ``reason`` is ``rate_limited``, ``bad_request``
    or ``unavailable`` (an outage, a timeout, or an answer this SDK can't read: the
    token still ends when it expires). ``status`` is the HTTP status, 0 when nothing
    came back."""

    reason: str
    status: int
    ok: Literal[False] = False


def revoke_token(
    token: Union[str, list[str]],
    *,
    issuer: str = SESSION_ISSUER,
    timeout: float = _DEFAULT_TIMEOUT,
) -> Union[TokensRevoked, RevokeRefusal]:
    """
    End a sign-in token at the auth host (``POST <issuer>/api/auth/revoke``), on
    every site that reads the list of ended sessions. Holding a token is the
    authority to end it; nothing else is sent. Call it once your own session has
    taken over. Takes one token or a list of up to eight. An outage is a result,
    never an exception, so it can't break a sign-in.
    """
    tokens: Any = [token] if isinstance(token, str) else list(token) if isinstance(token, (list, tuple)) else None
    if (
        tokens is None
        or not 1 <= len(tokens) <= _MAX_TOKENS
        or not all(isinstance(t, str) and 0 < len(t) <= _MAX_TOKEN_LENGTH for t in tokens)
    ):
        raise ValueError(
            f"revoke_token: pass one token, or 1 to {_MAX_TOKENS}, each a non-empty string "
            f"of at most {_MAX_TOKEN_LENGTH} characters"
        )
    try:
        url = _issuer_origin(issuer) + "/api/auth/revoke"
    except ValueError as err:
        raise ValueError(f"revoke_token: {err}") from err
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 0 < timeout <= _MAX_TIMEOUT:
        raise ValueError(f"revoke_token: timeout must be above 0 and at most {_MAX_TIMEOUT:g} seconds")
    try:
        resp = httpx.post(
            url,
            json={"tokens": tokens},
            headers={"Content-Type": "application/json"},
            timeout=timeout,
            follow_redirects=False,
        )
    except httpx.HTTPError:
        return RevokeRefusal(reason="unavailable", status=0)
    # The endpoint never redirects, so a redirect is an error, as in me-client:
    # the tokens go to the auth host and nowhere else.
    if resp.is_redirect or 300 <= resp.status_code < 400:
        return RevokeRefusal(reason="unavailable", status=0)
    if resp.status_code == 200:
        try:
            body = resp.json()
        except ValueError:
            body = None
        n = body.get("revoked") if isinstance(body, dict) else None
        if (
            isinstance(body, dict)
            and body.get("ok") is True
            and isinstance(n, int)
            and not isinstance(n, bool)
            and 0 <= n <= _MAX_SAFE_INTEGER
        ):
            return TokensRevoked(revoked=n)
        return RevokeRefusal(reason="unavailable", status=200)
    if resp.status_code == 429:
        return RevokeRefusal(reason="rate_limited", status=429)
    if resp.status_code == 400:
        return RevokeRefusal(reason="bad_request", status=400)
    return RevokeRefusal(reason="unavailable", status=resp.status_code)
