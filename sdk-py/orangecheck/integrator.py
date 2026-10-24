"""
Helpers for a site's own backend when it signs people in with ochk.app.

Three jobs, the same wire formats as ``@orangecheck/me-client``:

    from orangecheck import verify_session, sign_event, verify_webhook

    session = verify_session(token, audience="https://your-site.example")
    header = sign_event(signing_secret, body)          # X-OC-Signature
    event = verify_webhook(request.headers, raw_body)

    # Refuse a session the person ended everywhere (one list per process):
    revocations = RevocationList(project_key, signing_secret)
    session = verify_session(token, audience, revocations=revocations, method=request.method)

Both SDKs are held to one set of vectors
(``me-client/test-vectors/integrator.json``), so they accept and refuse the
same tokens, signatures and deliveries.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import logging
import math
import os
import re
import threading
import time
import weakref
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Optional, Union
from urllib.parse import quote, urlsplit

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from .errors import OrangeCheckError

#: The auth host. Sign-in tokens name it as ``iss``; its key set signs them.
SESSION_ISSUER = "https://ochk.io"
SESSION_JWKS_URL = "https://ochk.io/.well-known/jwks.json"
#: me.ochk.io signs webhook deliveries with its own key (the path is historical).
WEBHOOK_JWKS_URL = "https://me.ochk.io/api/dev-jwks"

_JWKS_TTL_SECONDS = 3600
#: How old a key set may be and still stand in for one that can't be fetched.
_JWKS_MAX_STALE_SECONDS = 6 * 3600
_FORCED_REFRESH_MIN_SECONDS = 60
#: After a failed fetch, how long requests use what is held before the next try.
_JWKS_RETRY_SECONDS = 10


class InvalidSession(OrangeCheckError):
    """The sign-in token did not verify. ``reason`` says why, in one word."""

    def __init__(self, reason: str, message: str | None = None):
        super().__init__(message or f"session token refused: {reason}")
        self.reason = reason


class SessionEnded(InvalidSession):
    """The person ended this session everywhere: signed out everywhere, removed a passkey or deleted the account."""

    def __init__(self) -> None:
        super().__init__("ended", "session token refused: the person ended it")


class InvalidWebhook(OrangeCheckError):
    """The webhook delivery did not verify. ``reason`` says why, in one word."""

    def __init__(self, reason: str, message: str | None = None):
        super().__init__(message or f"webhook refused: {reason}")
        self.reason = reason


@dataclass(frozen=True)
class Session:
    """A verified sign-in. ``did_oc`` is the person; ``sub`` is their account id."""

    sub: str
    did_oc: str
    jti: str
    aud: Union[str, list[str]]
    iat: Optional[int]
    exp: int
    #: Coin backing, when the person backed their account (see require-bond).
    oc_bond: Optional[dict[str, Any]] = None
    claims: dict[str, Any] = field(default_factory=dict)
    #: The token's revocation handle on its audience's list of ended sessions.
    rh: Optional[str] = None


# ─── key sets ────────────────────────────────────────────────────────────


def _clock() -> float:
    """Seconds on a clock that never steps back."""
    return time.monotonic()


def _since(mono: float, wall: float) -> float:
    """Seconds since a moment stamped on both clocks: the longer reading. Every cache
    here measures how long it has held a copy, and how long since a failed read, this
    way, so neither a wall clock set back nor a pause the monotonic clock slept
    through (a suspended host) can stretch a minute, a wait or a stand-in."""
    return max(_clock() - mono, time.time() - wall)


def _finite(v: Any) -> bool:
    """A JSON number Node reads as one: not a bool, not NaN, not infinite."""
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _failure_reason(err: BaseException) -> str:
    """A failed fetch in a few words: ``HTTP 403 domain_unverified``, ``ConnectError: …``."""
    if isinstance(err, httpx.HTTPStatusError):
        code = ""
        try:
            body = err.response.json()
            if isinstance(body, dict):
                code = str(body.get("error") or body.get("reason") or "")
        except ValueError:
            pass
        return f"HTTP {err.response.status_code}" + (f" {code}" if code else "")
    if isinstance(err, InvalidSession):
        return err.reason
    return f"{type(err).__name__}: {err}"


@dataclass(frozen=True)
class WarmPart:
    """
    One thing :func:`warm_session` keeps warm. ``state`` is ``"fetched"`` (read
    just now), ``"kept"`` (the copy in memory is still fresh) or ``"failed"`` (it
    could not be read; ``reason`` says why, and an older copy may still answer).
    """

    state: str
    reason: Optional[str] = None


@dataclass(frozen=True)
class WarmResult:
    """What :func:`warm_session` did: the key set, the sign-in rule and each audience's list."""

    keys: WarmPart
    policy: Optional[WarmPart] = None
    lists: dict[str, WarmPart] = field(default_factory=dict)

    def failures(self) -> list[str]:
        """Each part that failed, as ``"<part>: <reason>"``; empty when all is well."""
        parts = [("key set", self.keys)]
        if self.policy is not None:
            parts.append(("sign-in rule", self.policy))
        parts += [(f"list for {aud}", part) for aud, part in self.lists.items()]
        return [f"{name}: {part.reason}" for name, part in parts if part.state == "failed"]

    @property
    def ok(self) -> bool:
        return not self.failures()


_FETCHED = WarmPart("fetched")
_KEPT = WarmPart("kept")


# Every cache here guards itself with a lock. A process that forks while a
# thread holds one hands the child a lock nothing will release, so the child
# gets fresh locks.
_LOCKED: "weakref.WeakSet[Any]" = weakref.WeakSet()


def _new_locks_after_fork() -> None:
    for obj in list(_LOCKED):
        obj._new_locks()


if hasattr(os, "register_at_fork"):
    os.register_at_fork(after_in_child=_new_locks_after_fork)


class _KeySet:
    """A fetched JWKS, cached for an hour and kept through a failed refresh for six."""

    def __init__(self, url: str):
        self.url = url
        self._keys: dict[str, Ed25519PublicKey] = {}
        self._retired: dict[str, float] = {}
        self._fetched_at: Optional[float] = None
        self._fetched_wall = float("-inf")
        self._forced_at = self._forced_wall = float("-inf")
        self._failed_at = self._failed_wall = float("-inf")
        self._error: Optional[str] = None
        self._new_locks()
        _LOCKED.add(self)

    def _new_locks(self) -> None:
        self._lock = threading.Lock()

    def _fetch(self) -> None:
        try:
            r = httpx.get(self.url, headers={"Accept": "application/json"}, timeout=10.0)
            r.raise_for_status()
            doc = r.json()
            keys = _import_jwks(doc)
            # No key this verifier can use is a misdeploy at the host, not a reason to refuse every token.
            if not keys:
                raise ValueError("JWKS has no Ed25519 key")
            self._keys = keys
            self._retired = _retired_at(doc)
            self._fetched_at, self._fetched_wall = _clock(), time.time()
            self._error = None
        except (httpx.HTTPError, ValueError) as err:
            self._failed_at, self._failed_wall = _clock(), time.time()
            self._error = _failure_reason(err)
            # Stale on error: a key set seen before keeps working through an outage, for a while.
            if not self._keys or self._held() >= _JWKS_MAX_STALE_SECONDS:
                raise

    def _held(self) -> float:
        """How long the copy has been held; forever when there is none."""
        return float("inf") if self._fetched_at is None else _since(self._fetched_at, self._fetched_wall)

    def _refresh(self) -> None:
        """Fetch once the copy is an hour old; while fetches fail, try again at most every ten seconds."""
        if self._held() < _JWKS_TTL_SECONDS:
            return
        if _since(self._failed_at, self._failed_wall) >= _JWKS_RETRY_SECONDS:
            self._fetch()
        elif not self._keys or self._held() >= _JWKS_MAX_STALE_SECONDS:
            raise ValueError("key set unavailable")

    def warm(self) -> WarmPart:
        with self._lock:
            before = self._fetched_at
            try:
                self._refresh()
            except (httpx.HTTPError, ValueError) as err:
                return WarmPart("failed", self._error or _failure_reason(err))
            if self._fetched_at != before:
                return _FETCHED
            return WarmPart("failed", self._error) if self._error else _KEPT

    def retired_at(self, kid: str) -> Optional[float]:
        return self._retired.get(kid)

    def get(self, kid: str) -> Optional[Ed25519PublicKey]:
        with self._lock:
            self._refresh()
            key = self._keys.get(kid)
            # A key that rotated in since the last fetch: refetch, at most once a minute.
            if key is None and _since(self._forced_at, self._forced_wall) >= _FORCED_REFRESH_MIN_SECONDS:
                self._forced_at, self._forced_wall = _clock(), time.time()
                self._fetch()
                key = self._keys.get(kid)
            # A key may have rotated in while the set can't be fetched: that is an
            # outage, not a token the set does not know.
            if key is None and self._error is not None:
                raise ValueError(f"key set unavailable: {self._error}")
            return key


_session_keys = _KeySet(SESSION_JWKS_URL)
_webhook_keys = _KeySet(WEBHOOK_JWKS_URL)
#: Key sets of issuers other than ochk.io (a test stack's auth host), by issuer.
_issuer_keys: dict[str, _KeySet] = {}
_LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def _issuer_origin(issuer: str) -> str:
    """An issuer as one origin, ``scheme://host[:port]``: https, or http on this machine only.
    A path, a query, a fragment or a user name would send requests somewhere else on the
    host (or carry credentials), so each is refused. A trailing slash is allowed."""
    try:
        parts = urlsplit(issuer) if isinstance(issuer, str) else None
    except ValueError:
        parts = None
    if (
        parts is None
        or any(c in issuer for c in "?#@\\")
        or parts.path not in ("", "/")
        or not parts.hostname
        or not (parts.scheme == "https" or (parts.scheme == "http" and parts.hostname in _LOCAL_HOSTS))
    ):
        raise ValueError(
            f"issuer must be one https origin (http only on localhost), such as https://ochk.io, got {issuer!r}; "
            "pass jwks= to verify offline"
        )
    return f"{parts.scheme}://{parts.netloc}"


def _issuer_url(issuer: str) -> str:
    """Where an issuer's key set is: ``<issuer>/.well-known/jwks.json``."""
    return _issuer_origin(issuer) + "/.well-known/jwks.json"


def _keys_for(issuer: str) -> _KeySet:
    """The key set that signs ``issuer``'s tokens, as auth-core fetches it."""
    url = _issuer_url(issuer)
    if url == SESSION_JWKS_URL:
        return _session_keys
    keys = _issuer_keys.get(url)
    if keys is None:
        keys = _issuer_keys.setdefault(url, _KeySet(url))
    return keys


def _b64url(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _retired_at(doc: Any) -> dict[str, float]:
    """kid → ``retired_at`` for keys published as retired; 0 when it can't be read."""
    out: dict[str, float] = {}
    for k in doc.get("keys", []) if isinstance(doc, dict) else []:
        if isinstance(k, dict) and isinstance(k.get("kid"), str) and k.get("status") == "retired":
            at = k.get("retired_at")
            out[k["kid"]] = at if isinstance(at, (int, float)) and not isinstance(at, bool) else 0
    return out


def _import_jwks(doc: Any) -> dict[str, Ed25519PublicKey]:
    if not isinstance(doc, dict) or not isinstance(doc.get("keys"), list):
        raise ValueError("JWKS did not return {keys: [...]}")
    keys: dict[str, Ed25519PublicKey] = {}
    for k in doc["keys"]:
        if not isinstance(k, dict) or not isinstance(k.get("kid"), str):
            continue
        if k.get("kty") != "OKP" or k.get("crv") != "Ed25519" or not isinstance(k.get("x"), str):
            continue
        try:
            keys[k["kid"]] = Ed25519PublicKey.from_public_bytes(_b64url(k["x"]))
        except (ValueError, binascii.Error):
            continue
    return keys


# ─── revocation handles ──────────────────────────────────────────────────

REVOCATIONS_URL = "https://me.ochk.io/api/integrator/revocations"
_REVOCATIONS_TTL_SECONDS = 60
_REVOCATIONS_MAX_STALE_SECONDS = 600
_REVOCATIONS_SKEW_SECONDS = 60
_REVOCATIONS_RETRY_SECONDS = 10
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
_log = logging.getLogger("orangecheck")


def revocation_key(kind: str, value: str) -> str:
    """The revocation store's key for a token (``"jti"``) or an account (``"sub"``), as auth-core derives it."""
    digest = hashlib.sha256(f"ocrev1:{kind}:{value}".encode("utf-8")).digest()[:16]
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


class _AudienceList:
    """me.ochk.io's ended handles for one audience, fetched at most once a minute."""

    def __init__(self, owner: "RevocationList", aud: str):
        self._owner = owner
        self._path = (
            "/api/integrator/revocations?project_key="
            + quote(owner._project_key, safe="-_.!~*'()")
            + "&aud="
            + quote(aud, safe="-_.!~*'()")
        )
        self._handles: dict[str, float] = {}
        self._at: Optional[float] = None
        # How old the list already was when fetched, by the wall clock.
        self._age_at_fetch = float("inf")
        self._fetched_at: Optional[float] = None
        self._fetched_wall = float("-inf")
        self._failed_at = self._failed_wall = float("-inf")
        self._error: Optional[str] = None
        self._new_locks()
        _LOCKED.add(self)

    def _new_locks(self) -> None:
        self._lock = threading.Lock()

    def _fetch(self) -> None:
        try:
            r = httpx.get(
                self._owner._base + self._path,
                headers={
                    "Accept": "application/json",
                    "X-OC-Signature": sign_event(self._owner._secret, f"GET {self._path}"),
                },
                timeout=3.0,
            )
            r.raise_for_status()
            doc = r.json()
            # The shape auth-core's parseFeed takes, and nothing looser.
            if (
                not isinstance(doc, dict)
                or not _finite(doc.get("v"))
                or doc.get("v") != 1
                or not isinstance(doc.get("tokens"), list)
                or not isinstance(doc.get("accounts"), dict)
            ):
                raise ValueError("revocations: unexpected body")
            raw = doc.get("handles")
            handles: dict[str, Any] = raw if isinstance(raw, dict) else {}
            self._handles = {k: float(v) for k, v in handles.items() if _finite(v)}
            at: Any = doc.get("at")
            self._at = float(at) if _finite(at) else None
            self._age_at_fetch = float("inf") if self._at is None else time.time() - self._at
            self._fetched_at, self._fetched_wall = _clock(), time.time()
            self._error = None
        except (httpx.HTTPError, ValueError) as err:
            # Keep the last copy; try again after a short wait.
            self._failed_at, self._failed_wall = _clock(), time.time()
            self._error = _failure_reason(err)
            self._owner._warn_once(err)

    def _refresh(self) -> None:
        fresh = self._fetched_at is not None and _since(self._fetched_at, self._fetched_wall) < _REVOCATIONS_TTL_SECONDS
        if not fresh and _since(self._failed_at, self._failed_wall) >= _REVOCATIONS_RETRY_SECONDS:
            self._fetch()

    def _cannot_vouch(self) -> Optional[str]:
        """Why the copy held can't say a session is live, or None when it can."""
        if self._fetched_at is None:
            return self._error or "no list read yet"
        wall = time.time()
        # Dated ahead of this clock: judged on each call, so it ends once the clock catches up.
        if self._at is None or self._at > wall + _REVOCATIONS_SKEW_SECONDS:
            return "the list's own time is missing or ahead of this clock"
        # The list's age is its own: its age when fetched grown on the monotonic clock,
        # or read against the wall clock now, whichever is longer. An old copy served
        # fresh is still old; neither a clock set back nor a pause makes it younger.
        age = max(self._age_at_fetch + (_clock() - self._fetched_at), wall - self._at)
        if age > _REVOCATIONS_MAX_STALE_SECONDS:
            return "the list is older than ten minutes by its own clock"
        return None

    def warm(self) -> WarmPart:
        with self._lock:
            before = self._fetched_at
            self._refresh()
            problem = self._error or self._cannot_vouch()
            if problem:
                return WarmPart("failed", problem)
            return _FETCHED if self._fetched_at != before else _KEPT

    def status(self, rh: str, iat: Optional[float]) -> str:
        with self._lock:
            self._refresh()
            if self._fetched_at is None:
                return "unverified"
            cutoff = self._handles.get(rh)
            if cutoff is not None and not (iat is not None and iat >= cutoff):
                return "revoked"
            return "unverified" if self._cannot_vouch() else "live"


class RevocationList:
    """
    Sessions the person ended everywhere (sign out everywhere, a passkey removed,
    an account deleted), as ``@orangecheck/auth-core``'s ``integratorRevocationCheck``
    sees them. A sign-in token carries ``rh``, its revocation handle for its own
    audience; this looks it up in me.ochk.io's list of ended handles for that
    audience, fetched at most once a minute per audience with a request signed by
    your project secret over method, path and audience. Make one per process and
    pass it to :func:`verify_session`.

    ``status(rh, aud, iat)`` is ``"revoked"``, ``"live"``, or ``"unverified"`` when
    no list younger than ten minutes (by its own ``at``) could be read: then reads
    may go on, but a write should not. A token without ``rh`` is ``"live"``: it is
    checked by its signature alone. A handle that is not a non-empty string, or
    comes without one string ``aud``, is ``"revoked"``: no list can end it.
    """

    def __init__(self, project_key: str, signing_secret: str, *, url: str = REVOCATIONS_URL):
        # An empty key or secret signs requests me.ochk.io refuses, so every write
        # would be refused for as long as the process runs. Say so here instead.
        for name, value in (("project_key", project_key), ("signing_secret", signing_secret)):
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"RevocationList: {name} must be one non-empty string")
        self._project_key = project_key
        self._secret = signing_secret
        self._base = url[: -len("/api/integrator/revocations")] if url.endswith("/api/integrator/revocations") else url
        self._lists: dict[str, _AudienceList] = {}
        self._warned = False
        self._new_locks()
        _LOCKED.add(self)

    def _new_locks(self) -> None:
        self._lists_lock = threading.Lock()

    def _warn_once(self, err: Exception) -> None:
        if self._warned:
            return
        self._warned = True
        _log.warning("orangecheck: the revocation list could not be read (%s); reads go on, writes are refused until it can", err)

    def _list(self, aud: str) -> _AudienceList:
        with self._lists_lock:
            lst = self._lists.get(aud)
            if lst is None:
                lst = self._lists[aud] = _AudienceList(self, aud)
            return lst

    def status(self, rh: Optional[str], aud: Optional[str], iat: Optional[float]) -> str:
        if rh is None:
            return "live"
        return self._status(rh, aud, iat)

    def status_for(self, claims: Mapping[str, Any]) -> str:
        """
        ``status`` for a token's claims, as ``integratorRevocationCheck`` reads them: a
        token with no ``rh`` key is ``"live"``, and ``"rh": null`` is a handle that is
        not a string, so ``"revoked"``. :func:`verify_session` uses this.
        """
        if "rh" not in claims:
            return "live"
        return self._status(claims["rh"], claims.get("aud"), claims.get("iat"))

    def _status(self, rh: Any, aud: Any, iat: Optional[float]) -> str:
        if not isinstance(rh, str) or not rh or not isinstance(aud, str) or not aud:
            return "revoked"
        return self._list(aud).status(rh, iat)


# ─── who may sign in (coin backing) ──────────────────────────────────────

#: Where someone turned away for want of backing can back their account.
BACK_ACCOUNT_URL = "https://ochk.app/me/account#backing"
_POLICY_TTL_SECONDS = 60
_POLICY_RETRY_SECONDS = 10
#: How long the last requirement read stands while it can't be read again.
_POLICY_MAX_STALE_SECONDS = 600
_NULLIFIER = re.compile(r"[0-9a-f]{64}")


class BondRequired(InvalidSession):
    """The account is not backed enough to sign in here. ``need``, ``have`` and ``back_url`` say why and where to fix it."""

    def __init__(self, need: dict[str, int], have: Optional[dict[str, int]]):
        super().__init__("bond_required", "session token refused: the account is not backed enough to sign in here")
        self.need = need
        self.have = have
        self.back_url = BACK_ACCOUNT_URL


def read_bond_claim(claims: Union[Session, Mapping[str, Any]]) -> Optional[dict[str, Any]]:
    """The token's coin backing claim (``oc_bond``) when well-formed, else None. As auth-core's ``readBondClaim``."""
    b = claims.oc_bond if isinstance(claims, Session) else claims.get("oc_bond")
    if not isinstance(b, dict) or not _finite(b.get("v")) or b.get("v") != 1:
        return None
    for k in ("sats_floor", "days_floor", "height", "checked_at"):
        n: Any = b.get(k)
        if not _finite(n) or n < 0:
            return None
    if not isinstance(b.get("nullifier"), str) or not _NULLIFIER.fullmatch(b["nullifier"]):
        return None
    return b


def bond_meets(
    claims: Union[Session, Mapping[str, Any]],
    *,
    min_sats: int = 0,
    min_days: int = 0,
    max_age_secs: Optional[int] = None,
) -> bool:
    """
    True when a coin backs the account with floors reaching ``min_sats`` and
    ``min_days``, checked by the issuer within ``max_age_secs`` (default: any
    age). As auth-core's ``bondMeets``: compare against the floor ladder, so
    ``min_sats=50000`` is met by a ``sats_floor`` of 100000, not 10000.
    """
    b = read_bond_claim(claims)
    if b is None:
        return False
    if b["sats_floor"] < min_sats or b["days_floor"] < min_days:
        return False
    if max_age_secs is not None:
        age = math.floor(time.time()) - b["checked_at"]
        if age < 0 or age > max_age_secs:
            return False
    return True


class SignInPolicy:
    """
    Your project's "who can sign in" requirement, set on ochk.app, read from
    me.ochk.io (``/api/integrator/<key>/sign-in``) and held a minute, as
    me-client's ``withOcAuth({ projectKey })`` reads it. Pass it to
    :func:`verify_session`. While it can't be read, or the answer does not say
    it, the last one read stands for ten minutes; with none read in that time,
    sign-in is refused (reason ``bond_policy_unavailable``) rather than let
    through unchecked. A key that names no project is refused with reason
    ``unknown_project_key``.
    """

    def __init__(self, project_key: str, *, me_origin: str = "https://me.ochk.io"):
        self._url = me_origin.rstrip("/") + "/api/integrator/" + quote(project_key, safe="") + "/sign-in"
        self._need: Optional[dict[str, int]] = None
        self._read_at: Optional[float] = None
        self._read_wall = float("-inf")
        self._failed_at = self._failed_wall = float("-inf")
        self._unknown_at = self._unknown_wall = float("-inf")
        self._error: Optional[str] = None
        self._new_locks()
        _LOCKED.add(self)

    def _new_locks(self) -> None:
        self._lock = threading.Lock()

    def requirement(self) -> Optional[dict[str, int]]:
        """``{"min_sats", "min_days"}``, or None for no requirement. Raises :class:`InvalidSession` as described above."""
        with self._lock:
            return self._requirement()

    def _requirement(self) -> Optional[dict[str, int]]:
        if _since(self._unknown_at, self._unknown_wall) < _POLICY_TTL_SECONDS:
            raise InvalidSession("unknown_project_key")
        if self._read_at is not None and _since(self._read_at, self._read_wall) < _POLICY_TTL_SECONDS:
            return self._need
        if _since(self._failed_at, self._failed_wall) < _POLICY_RETRY_SECONDS:
            return self._stand_in()
        try:
            r = httpx.get(self._url, headers={"Accept": "application/json"}, timeout=4.0)
            if r.status_code == 404:
                self._unknown_at, self._unknown_wall = _clock(), time.time()
                raise InvalidSession("unknown_project_key")
            r.raise_for_status()
            self._need = _read_requirement(r.json())
            self._read_at, self._read_wall = _clock(), time.time()
            self._error = None
            return self._need
        except (httpx.HTTPError, ValueError) as err:
            # The wait counts from the failure, not from when the read began.
            self._failed_at, self._failed_wall = _clock(), time.time()
            self._error = _failure_reason(err)
            return self._stand_in()

    def _warm(self) -> WarmPart:
        with self._lock:
            before = self._read_at
            try:
                self._requirement()
            except InvalidSession as err:
                return WarmPart("failed", self._error if err.reason == "bond_policy_unavailable" and self._error else err.reason)
            if self._read_at != before:
                return _FETCHED
            return WarmPart("failed", self._error) if self._error else _KEPT

    def _stand_in(self) -> Optional[dict[str, int]]:
        if self._read_at is None or _since(self._read_at, self._read_wall) >= _POLICY_MAX_STALE_SECONDS:
            raise InvalidSession("bond_policy_unavailable")
        return self._need


def _read_requirement(doc: Any) -> Optional[dict[str, int]]:
    """The rule in me.ochk.io's answer, ``None`` for none; ValueError when the answer does not say it."""
    if not isinstance(doc, dict) or doc.get("ok") is not True or "require_bond" not in doc:
        raise ValueError("sign-in: unexpected body")
    req = doc["require_bond"]
    if req is None:
        return None
    floors: list[Any] = [req.get(k) for k in ("min_sats", "min_days")] if isinstance(req, dict) else []
    if len(floors) != 2 or not all(isinstance(n, int) and not isinstance(n, bool) and n >= 0 for n in floors):
        raise ValueError("sign-in: unexpected body")
    return {"min_sats": floors[0], "min_days": floors[1]}


def _need_from(require_bond: Mapping[str, Any]) -> dict[str, int]:
    need = {"min_sats": int(require_bond.get("min_sats", 0)), "min_days": int(require_bond.get("min_days", 0))}
    if require_bond.get("max_age_secs") is not None:
        need["max_age_secs"] = int(require_bond["max_age_secs"])
    return need


def _apply_rule(
    claims: Union[Session, Mapping[str, Any]],
    require_bond: Optional[Mapping[str, Any]],
    policy: Optional[SignInPolicy],
) -> None:
    """Raise :class:`BondRequired` when the account is not backed enough. An explicit requirement wins over the project's."""
    need = _need_from(require_bond) if require_bond is not None else (policy.requirement() if policy else None)
    if need is not None and not bond_meets(
        claims,
        min_sats=need.get("min_sats", 0),
        min_days=need.get("min_days", 0),
        max_age_secs=need.get("max_age_secs"),
    ):
        backing = read_bond_claim(claims)
        floors = (
            {"sats_floor": int(backing["sats_floor"]), "days_floor": int(backing["days_floor"])} if backing else None
        )
        raise BondRequired(need, floors)


_policies: dict[tuple[str, str], SignInPolicy] = {}

# Each Session verify_session returned, so check_sign_in_rule takes nothing else:
# claims anyone built could carry any did and any backing.
_verified: "weakref.WeakValueDictionary[int, Session]" = weakref.WeakValueDictionary()


def _policy_for(project_key: str, me_origin: str) -> SignInPolicy:
    """One :class:`SignInPolicy` per project, so its minute holds from call to call."""
    policy = _policies.get((me_origin, project_key))
    if policy is None:
        policy = _policies.setdefault((me_origin, project_key), SignInPolicy(project_key, me_origin=me_origin))
    return policy


# ─── sign-in tokens ──────────────────────────────────────────────────────


def warm_session(
    audience: Union[str, list[str]],
    *,
    revocations: Optional[RevocationList] = None,
    policy: Optional[SignInPolicy] = None,
    issuer: str = SESSION_ISSUER,
    jwks: Optional[Mapping[str, Any]] = None,
) -> WarmResult:
    """
    Fetch now what :func:`verify_session` with the same arguments would otherwise
    fetch inside a request: the issuer's key set (ochk.io's by default), your
    project's sign-in requirement and the revocation list for each audience, each
    only when its copy is due. With ``jwks`` given, no key set is fetched and
    ``keys`` reads ``"kept"``. Call it at startup and then every ten seconds from a
    background thread, in each process. It never raises: it returns a
    :class:`WarmResult` saying what it fetched, kept or failed to read, and why
    (``result.ok``, ``result.failures()``).
    """

    # A warming loop must outlive anything one of these meets.
    def part(warm: Any) -> WarmPart:
        try:
            out = warm()
            return out if isinstance(out, WarmPart) else WarmPart("failed", "no answer")
        except Exception as err:
            return WarmPart("failed", _failure_reason(err))

    lists: dict[str, WarmPart] = {}
    if revocations is not None:
        for aud in [audience] if isinstance(audience, str) else audience:
            if isinstance(aud, str) and aud:
                lists[aud] = part(lambda aud=aud: revocations._list(aud).warm())
    return WarmResult(
        keys=_KEPT if jwks is not None else part(lambda: _keys_for(issuer).warm()),
        policy=part(policy._warm) if policy is not None else None,
        lists=lists,
    )


def verify_session(
    token: str,
    audience: Union[str, list[str]],
    *,
    jwks: Optional[Mapping[str, Any]] = None,
    issuer: str = SESSION_ISSUER,
    leeway: int = 0,
    revocations: Optional[RevocationList] = None,
    method: Optional[str] = None,
    require_bond: Optional[Mapping[str, Any]] = None,
    policy: Optional[SignInPolicy] = None,
    require_handle: bool = True,
) -> Session:
    """
    Verify a token from the ochk.app sign-in popup and return who signed in.

    ``audience`` is the origin of the page that opened the popup, exactly
    (``https://your-site.example``, or ``http://localhost:5173`` while you
    develop). A token issued to any other origin, or a family token with no
    ``aud`` at all, is refused. The key set is fetched from
    ``<issuer>/.well-known/jwks.json`` (``https://ochk.io``'s by default, over
    https; http only on localhost) and cached for an hour; pass ``jwks`` to
    verify offline, and it wins over the fetch.

    Raises :class:`InvalidSession` on any failure. The token proves who signed
    in until it expires (up to 30 days). Pass ``revocations`` (a
    :class:`RevocationList`) to refuse one the person ended everywhere with
    :class:`SessionEnded`. Pass the request's ``method`` too: while the list
    can't be read, a read goes on and anything else is refused with reason
    ``revocations_unavailable``; with no method, a request counts as a write.

    A token with no ``rh``, its handle on your project's list of ended
    sessions, is refused with reason ``no_session_handle``: sign out
    everywhere could not end it. Every token from the sign-in popup carries
    one. ``require_handle=False`` accepts one minted some other way, and then
    sign out everywhere does not end it.
    """
    if not isinstance(require_handle, bool):
        raise TypeError("require_handle must be True or False")
    parts = token.split(".") if isinstance(token, str) else []
    if len(parts) != 3:
        raise InvalidSession("malformed")
    try:
        header = json.loads(_b64url(parts[0]))
        payload = json.loads(_b64url(parts[1]))
        signature = _b64url(parts[2])
    except (ValueError, binascii.Error) as err:
        raise InvalidSession("malformed") from err
    if not isinstance(header, dict) or not isinstance(payload, dict):
        raise InvalidSession("malformed")
    if header.get("alg") != "EdDSA":
        raise InvalidSession("algorithm")
    if "crit" in header:
        raise InvalidSession("malformed")
    kid = header.get("kid")
    if not isinstance(kid, str) or not kid:
        raise InvalidSession("malformed")

    if jwks is not None:
        try:
            key = _import_jwks(dict(jwks)).get(kid)
        except ValueError as err:
            raise InvalidSession("unknown_key") from err
        retired_at = _retired_at(dict(jwks)).get(kid)
    else:
        keys = _keys_for(issuer)
        try:
            key = keys.get(kid)
        except (httpx.HTTPError, ValueError) as err:
            raise InvalidSession("key_set_unavailable") from err
        retired_at = keys.retired_at(kid)
    if key is None:
        raise InvalidSession("unknown_key")
    try:
        key.verify(signature, f"{parts[0]}.{parts[1]}".encode("ascii"))
    except InvalidSignature as err:
        raise InvalidSession("signature") from err

    # A trailing slash on the issuer asked for names the same issuer.
    if payload.get("iss") not in (issuer, issuer.rstrip("/")):
        raise InvalidSession("issuer")
    now = time.time()
    exp = payload.get("exp")
    if not isinstance(exp, (int, float)) or isinstance(exp, bool):
        raise InvalidSession("claims")
    if exp <= now - leeway:
        raise InvalidSession("expired")
    nbf = payload.get("nbf")
    if nbf is not None and (not isinstance(nbf, (int, float)) or nbf > now + leeway):
        raise InvalidSession("not_yet_valid")
    iat = payload.get("iat")
    if iat is not None and not isinstance(iat, (int, float)):
        raise InvalidSession("claims")
    # A retired key vouches only for what it signed before it retired.
    if retired_at is not None and not (iat is not None and iat < retired_at):
        raise InvalidSession("retired_key")
    for claim in ("sub", "did_oc", "jti"):
        if not isinstance(payload.get(claim), str) or not payload[claim]:
            raise InvalidSession("claims")

    aud = payload.get("aud")
    have = aud if isinstance(aud, list) else ([] if aud is None else [aud])
    want = [audience] if isinstance(audience, str) else list(audience)
    if not any(isinstance(a, str) and a in want for a in have):
        raise InvalidSession("audience")
    rh = payload.get("rh")
    if require_handle and not (isinstance(rh, str) and rh):
        raise InvalidSession("no_session_handle")
    # A handle is kept on one audience's list, so a token carrying one names
    # one audience, as a string; with no handle the token is checked as before.
    if "rh" in payload:
        if not (isinstance(rh, str) and rh):
            raise InvalidSession("claims")
        if not isinstance(aud, str):
            raise InvalidSession("audience")

    if revocations is not None:
        state = revocations.status_for(payload)
        if state == "revoked":
            raise SessionEnded()
        if state == "unverified" and (method or "").upper() not in _SAFE_METHODS:
            raise InvalidSession("revocations_unavailable")

    _apply_rule(payload, require_bond, policy)

    bond = payload.get("oc_bond")
    session = Session(
        sub=payload["sub"],
        did_oc=payload["did_oc"],
        jti=payload["jti"],
        aud=list(aud) if isinstance(aud, list) else str(aud),
        iat=int(iat) if iat is not None else None,
        exp=int(exp),
        oc_bond=bond if isinstance(bond, dict) else None,
        claims=payload,
        rh=rh if isinstance(rh, str) else None,
    )
    _verified[id(session)] = session
    return session


#: Can't tell right now: the client should try again, never sign the person out.
_UNAVAILABLE = frozenset({"revocations_unavailable", "key_set_unavailable", "bond_policy_unavailable"})


@dataclass(frozen=True)
class SessionCheck:
    """
    One request's answer, as ``@orangecheck/me-client``'s ``withOcAuth`` (with
    ``required: true``) gives it. ``status`` is 200, with ``session``, when the
    person is signed in. Otherwise it is the HTTP status to answer, and ``body``
    the JSON to send:

    - 401 ``unauthenticated``: no token, one that does not verify, or one the
      person ended everywhere;
    - 401 ``no_session_handle``: a token sign out everywhere could not end;
    - 403 ``bond_required``: the account is not backed enough here, with
      ``need``, ``have`` and ``back_url``;
    - 503 ``revocations_unavailable`` (a write while the list of ended sessions
      can't be read), ``key_set_unavailable`` or ``bond_policy_unavailable``:
      can't tell right now, so the client tries again instead of signing out;
    - 500 ``unknown_project_key``: the :class:`SignInPolicy` names no project.
    """

    status: int
    session: Optional[Session] = None
    body: Optional[dict[str, Any]] = None

    @property
    def ok(self) -> bool:
        return self.status == 200


def check_oc_session(
    token: Optional[str],
    audience: Union[str, list[str]],
    *,
    jwks: Optional[Mapping[str, Any]] = None,
    issuer: str = SESSION_ISSUER,
    leeway: int = 0,
    revocations: Optional[RevocationList] = None,
    method: Optional[str] = None,
    require_bond: Optional[Mapping[str, Any]] = None,
    policy: Optional[SignInPolicy] = None,
    require_handle: bool = True,
) -> SessionCheck:
    """
    :func:`verify_session` as the HTTP answer for a request: a :class:`SessionCheck`
    with the status and body me-client's adapters send, held to the same vectors
    (``me-client/test-vectors/server-helpers.json``). ``token`` is the request's
    token, or None when it brought none. It takes ``verify_session``'s arguments
    and raises only on a mistake in the call itself.

        checked = check_oc_session(bearer, "https://your-site.example",
                                   revocations=revocations, method=request.method)
        if not checked.ok:
            return JSONResponse(checked.body, status_code=checked.status)
        session = checked.session
    """
    if not isinstance(require_handle, bool):
        raise TypeError("require_handle must be True or False")
    if jwks is None:
        _issuer_url(issuer)
    if not isinstance(token, str) or not token:
        return SessionCheck(401, body={"ok": False, "reason": "unauthenticated"})
    try:
        session = verify_session(
            token,
            audience,
            jwks=jwks,
            issuer=issuer,
            leeway=leeway,
            revocations=revocations,
            method=method,
            require_bond=require_bond,
            policy=policy,
            require_handle=require_handle,
        )
    except InvalidSession as err:
        return _refused(err)
    return SessionCheck(200, session=session)


def _refused(err: InvalidSession) -> SessionCheck:
    if isinstance(err, BondRequired):
        return SessionCheck(
            403,
            body={
                "ok": False,
                "reason": "bond_required",
                "need": dict(err.need),
                "have": dict(err.have) if err.have is not None else None,
                "back_url": err.back_url,
            },
        )
    if err.reason in _UNAVAILABLE:
        return SessionCheck(503, body={"ok": False, "reason": err.reason})
    if err.reason == "unknown_project_key":
        return SessionCheck(500, body={"ok": False, "reason": err.reason})
    reason = "no_session_handle" if err.reason == "no_session_handle" else "unauthenticated"
    return SessionCheck(401, body={"ok": False, "reason": reason})


def check_sign_in_rule(
    session: Session,
    *,
    project_key: Optional[str] = None,
    me_origin: str = "https://me.ochk.io",
    policy: Optional[SignInPolicy] = None,
    require_bond: Optional[Mapping[str, Any]] = None,
) -> SessionCheck:
    """
    Your project's "who can sign in" rule for a session you verified yourself,
    as me-client's ``checkSignInRule``. For a site that verifies the token with
    :func:`verify_session` and then starts a session of its own, and still wants
    the rule set on ochk.app. ``session`` is the :class:`Session` that
    :func:`verify_session` or :func:`check_oc_session` returned, as is; claims
    as a dict, or a Session built any other way, raise TypeError. Apply the rule
    where your own session starts, while you hold the verified one.

    The rule is read and held as :class:`SignInPolicy` holds it: a minute, the
    last one read standing ten more while it can't be read, and then refused
    (503 ``bond_policy_unavailable``) rather than let through unchecked. The
    answer is a :class:`SessionCheck`: 200, 403 ``bond_required`` with
    ``need``, ``have`` and ``back_url``, 503, or 500 ``unknown_project_key``.
    Pass ``require_bond`` to set the floor yourself; it wins, and nothing is
    read. It raises only on a mistake in the call itself.

        checked = check_sign_in_rule(session, project_key=os.environ["OC_PROJECT_KEY"])
        if not checked.ok:
            return JSONResponse(checked.body, status_code=checked.status)
    """
    if not isinstance(session, Session) or _verified.get(id(session)) is not session:
        raise TypeError("check_sign_in_rule takes the Session verify_session returned, as is, not claims")
    if project_key is not None and policy is not None:
        raise TypeError("pass project_key or policy, not both")
    if project_key is not None and (not isinstance(project_key, str) or not project_key):
        raise TypeError("project_key must be your project's key")
    if project_key is None and policy is None and require_bond is None:
        raise TypeError("check_sign_in_rule needs project_key, policy or require_bond")
    if project_key is not None:
        policy = _policy_for(project_key, me_origin)
    try:
        _apply_rule(session, require_bond, policy)
    except InvalidSession as err:
        return _refused(err)
    return SessionCheck(200, session=session)


# ─── billable events ─────────────────────────────────────────────────────


def sign_event(
    secret: str, body: Union[str, bytes], *, timestamp: Optional[int] = None
) -> str:
    """
    The ``X-OC-Signature`` header for a request to ``/api/integrator/event``.

    ``body`` must be the exact bytes you send; serialise once and send that
    string. The key is the signing secret's text as UTF-8 (it is not
    hex-decoded), and the MAC covers ``f"{t}.{body}"``. me.ochk.io refuses a
    timestamp more than 300 seconds behind its clock or 60 seconds ahead, and
    processes the same signed bytes once: sending them again returns the first
    event, whatever ``Idempotency-Key`` they carry.

        body = json.dumps({"project_key": key, "subtype": "account_created",
                           "user_address": session.did_oc})
        httpx.post(url, content=body, headers={
            "Content-Type": "application/json",
            "X-OC-Signature": sign_event(secret, body),
        })
    """
    t = int(time.time()) if timestamp is None else int(timestamp)
    raw = body.encode("utf-8") if isinstance(body, str) else bytes(body)
    mac = hmac.new(secret.encode("utf-8"), f"{t}.".encode("ascii") + raw, hashlib.sha256)
    return f"t={t},v1={mac.hexdigest()}"


# ─── webhooks ────────────────────────────────────────────────────────────


def _header(headers: Mapping[str, Any], name: str) -> Optional[str]:
    want = name.lower()
    for k, v in headers.items():
        if isinstance(k, str) and k.lower() == want:
            return v if isinstance(v, str) else None
    return None


def verify_webhook(
    headers: Mapping[str, Any],
    body: Union[str, bytes],
    *,
    jwks: Optional[Mapping[str, Any]] = None,
) -> dict[str, Any]:
    """
    Verify a webhook from me.ochk.io and return its parsed body.

    Pass the request headers and the raw body, before any JSON parsing. The
    signature is Ed25519 over those bytes: ``OC-Signature`` (hex) under the key
    named by ``OC-Key-Id``, from ``https://me.ochk.io/api/dev-jwks`` (cached for
    an hour; pass ``jwks`` to verify offline). The signature carries no
    timestamp, and a delivery may arrive more than once, so deduplicate on
    ``OC-Envelope-Id``.

    Raises :class:`InvalidWebhook` on any failure.
    """
    sig_hex = _header(headers, "OC-Signature")
    kid = _header(headers, "OC-Key-Id")
    if not sig_hex or not kid:
        raise InvalidWebhook("missing")
    try:
        signature = bytes.fromhex(sig_hex.strip())
    except ValueError as err:
        raise InvalidWebhook("malformed") from err
    if len(signature) != 64:
        raise InvalidWebhook("malformed")

    if jwks is not None:
        try:
            key = _import_jwks(dict(jwks)).get(kid)
        except ValueError as err:
            raise InvalidWebhook("unknown_key") from err
    else:
        try:
            key = _webhook_keys.get(kid)
        except (httpx.HTTPError, ValueError) as err:
            raise InvalidWebhook("key_set_unavailable") from err
    if key is None:
        raise InvalidWebhook("unknown_key")

    raw = body.encode("utf-8") if isinstance(body, str) else bytes(body)
    try:
        key.verify(signature, raw)
    except InvalidSignature as err:
        raise InvalidWebhook("signature") from err
    try:
        parsed = json.loads(raw)
    except ValueError as err:
        raise InvalidWebhook("malformed") from err
    if not isinstance(parsed, dict):
        raise InvalidWebhook("malformed")
    return parsed
