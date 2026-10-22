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
import re
import threading
import time
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Optional, Union
from urllib.parse import quote

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


# ─── key sets ────────────────────────────────────────────────────────────


class _KeySet:
    """A fetched JWKS, cached for an hour and kept through a failed refresh for six."""

    def __init__(self, url: str):
        self.url = url
        self._keys: dict[str, Ed25519PublicKey] = {}
        self._retired: dict[str, float] = {}
        self._fetched_at = 0.0
        self._forced_at = 0.0
        self._failed_at = float("-inf")
        self._lock = threading.Lock()

    def _fetch(self) -> None:
        try:
            r = httpx.get(self.url, headers={"Accept": "application/json"}, timeout=10.0)
            r.raise_for_status()
            doc = r.json()
            self._keys = _import_jwks(doc)
            self._retired = _retired_at(doc)
            self._fetched_at = time.time()
        except (httpx.HTTPError, ValueError):
            self._failed_at = time.time()
            # Stale on error: a key set seen before keeps working through an outage, for a while.
            if not self._keys or time.time() - self._fetched_at >= _JWKS_MAX_STALE_SECONDS:
                raise

    def _refresh(self) -> None:
        """Fetch once the copy is an hour old; while fetches fail, try again at most every ten seconds."""
        now = time.time()
        if self._keys and now - self._fetched_at < _JWKS_TTL_SECONDS:
            return
        if now - self._failed_at >= _JWKS_RETRY_SECONDS:
            self._fetch()
        elif not self._keys or now - self._fetched_at >= _JWKS_MAX_STALE_SECONDS:
            raise ValueError("key set unavailable")

    def warm(self) -> None:
        with self._lock:
            self._refresh()

    def retired_at(self, kid: str) -> Optional[float]:
        return self._retired.get(kid)

    def get(self, kid: str) -> Optional[Ed25519PublicKey]:
        with self._lock:
            self._refresh()
            key = self._keys.get(kid)
            # A key that rotated in since the last fetch: refetch, at most once a minute.
            if key is None and time.time() - self._forced_at >= _FORCED_REFRESH_MIN_SECONDS:
                self._forced_at = time.time()
                self._fetch()
                key = self._keys.get(kid)
            return key


_session_keys = _KeySet(SESSION_JWKS_URL)
_webhook_keys = _KeySet(WEBHOOK_JWKS_URL)


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
        self._fetched_at: Optional[float] = None
        self._failed_at = float("-inf")
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
            if not isinstance(doc, dict) or doc.get("v") != 1:
                raise ValueError("revocations: unexpected body")
            raw = doc.get("handles")
            handles: dict[str, Any] = raw if isinstance(raw, dict) else {}
            self._handles = {
                k: float(v) for k, v in handles.items() if isinstance(v, (int, float)) and not isinstance(v, bool)
            }
            at = doc.get("at")
            self._at = float(at) if isinstance(at, (int, float)) and not isinstance(at, bool) else None
            self._fetched_at = time.time()
        except (httpx.HTTPError, ValueError) as err:
            # Keep the last copy; try again after a short wait.
            self._failed_at = time.time()
            self._owner._warn_once(err)

    def _refresh(self, now: float) -> None:
        fresh = self._fetched_at is not None and now - self._fetched_at < _REVOCATIONS_TTL_SECONDS
        if not fresh and now - self._failed_at >= _REVOCATIONS_RETRY_SECONDS:
            self._fetch()

    def warm(self) -> None:
        with self._lock:
            self._refresh(time.time())

    def status(self, rh: str, iat: Optional[float]) -> str:
        with self._lock:
            now = time.time()
            self._refresh(now)
            if self._fetched_at is None:
                return "unverified"
            cutoff = self._handles.get(rh)
            if cutoff is not None and not (iat is not None and iat >= cutoff):
                return "revoked"
            # The list's age is its own: an old copy served fresh is still old.
            if self._at is None or self._at > now + _REVOCATIONS_SKEW_SECONDS:
                return "unverified"
            return "unverified" if now - self._at > _REVOCATIONS_MAX_STALE_SECONDS else "live"


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
    checked by its signature alone.
    """

    def __init__(self, project_key: str, signing_secret: str, *, url: str = REVOCATIONS_URL):
        self._project_key = project_key
        self._secret = signing_secret
        self._base = url[: -len("/api/integrator/revocations")] if url.endswith("/api/integrator/revocations") else url
        self._lists: dict[str, _AudienceList] = {}
        self._lists_lock = threading.Lock()
        self._warned = False

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
        if not isinstance(rh, str) or not rh or not isinstance(aud, str) or not aud:
            return "live"
        return self._list(aud).status(rh, iat)


# ─── who may sign in (coin backing) ──────────────────────────────────────

#: Where someone turned away for want of backing can back their account.
BACK_ACCOUNT_URL = "https://ochk.app/me/account#backing"
_POLICY_TTL_SECONDS = 60
_POLICY_RETRY_SECONDS = 10
_NULLIFIER = re.compile(r"^[0-9a-f]{64}$")


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
    if not isinstance(b, dict) or b.get("v") != 1:
        return None
    for k in ("sats_floor", "days_floor", "height", "checked_at"):
        n = b.get(k)
        if not isinstance(n, (int, float)) or isinstance(n, bool) or n < 0:
            return None
    if not isinstance(b.get("nullifier"), str) or not _NULLIFIER.match(b["nullifier"]):
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
        age = int(time.time()) - int(b["checked_at"])
        if age < 0 or age > max_age_secs:
            return False
    return True


class SignInPolicy:
    """
    Your project's "who can sign in" requirement, set on ochk.app, read from
    me.ochk.io (``/api/integrator/<key>/sign-in``) and held a minute, as
    me-client's ``withOcAuth({ projectKey })`` reads it. Pass it to
    :func:`verify_session`. While it can't be read, the last one read stands;
    with none read yet, sign-in is refused (reason ``bond_policy_unavailable``)
    rather than let through unchecked. A key that names no project is refused
    with reason ``unknown_project_key``.
    """

    def __init__(self, project_key: str, *, me_origin: str = "https://me.ochk.io"):
        self._url = me_origin.rstrip("/") + "/api/integrator/" + quote(project_key, safe="") + "/sign-in"
        self._need: Optional[dict[str, int]] = None
        self._read_at: Optional[float] = None
        self._failed_at = float("-inf")
        self._unknown_at = float("-inf")
        self._lock = threading.Lock()

    def requirement(self) -> Optional[dict[str, int]]:
        """``{"min_sats", "min_days"}``, or None for no requirement. Raises :class:`InvalidSession` as described above."""
        with self._lock:
            now = time.time()
            if now - self._unknown_at < _POLICY_TTL_SECONDS:
                raise InvalidSession("unknown_project_key")
            if self._read_at is not None and now - self._read_at < _POLICY_TTL_SECONDS:
                return self._need
            if now - self._failed_at < _POLICY_RETRY_SECONDS:
                return self._stand_in()
            try:
                r = httpx.get(self._url, headers={"Accept": "application/json"}, timeout=4.0)
                if r.status_code == 404:
                    self._unknown_at = now
                    raise InvalidSession("unknown_project_key")
                r.raise_for_status()
                req = r.json().get("require_bond")
                self._need = (
                    {"min_sats": int(req.get("min_sats", 0)), "min_days": int(req.get("min_days", 0))}
                    if isinstance(req, dict)
                    else None
                )
                self._read_at = now
                return self._need
            except (httpx.HTTPError, ValueError, AttributeError):
                self._failed_at = now
                return self._stand_in()

    def _stand_in(self) -> Optional[dict[str, int]]:
        if self._read_at is None:
            raise InvalidSession("bond_policy_unavailable")
        return self._need


def _need_from(require_bond: Mapping[str, Any]) -> dict[str, int]:
    need = {"min_sats": int(require_bond.get("min_sats", 0)), "min_days": int(require_bond.get("min_days", 0))}
    if require_bond.get("max_age_secs") is not None:
        need["max_age_secs"] = int(require_bond["max_age_secs"])
    return need


# ─── sign-in tokens ──────────────────────────────────────────────────────


def warm_session(
    audience: Union[str, list[str]],
    *,
    revocations: Optional[RevocationList] = None,
    policy: Optional[SignInPolicy] = None,
) -> None:
    """
    Fetch now what :func:`verify_session` with the same arguments would otherwise
    fetch inside a request: ochk.io's key set, your project's sign-in requirement
    and the revocation list for each audience, each only when its copy is due. Call
    it at startup and then every ten seconds from a background thread, in each
    process. It never raises; a failure is left for ``verify_session`` to meet.
    """
    try:
        _session_keys.warm()
    except (httpx.HTTPError, ValueError):
        pass
    if policy is not None:
        try:
            policy.requirement()
        except InvalidSession:
            pass
    if revocations is not None:
        for aud in [audience] if isinstance(audience, str) else audience:
            if isinstance(aud, str) and aud:
                revocations._list(aud).warm()


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
) -> Session:
    """
    Verify a token from the ochk.app sign-in popup and return who signed in.

    ``audience`` is the origin of the page that opened the popup, exactly
    (``https://your-site.example``, or ``http://localhost:5173`` while you
    develop). A token issued to any other origin, or a family token with no
    ``aud`` at all, is refused. The key set is fetched from
    ``https://ochk.io/.well-known/jwks.json`` and cached for an hour; pass
    ``jwks`` to verify offline.

    Raises :class:`InvalidSession` on any failure. The token proves who signed
    in until it expires (up to 30 days). Pass ``revocations`` (a
    :class:`RevocationList`) to refuse one the person ended everywhere with
    :class:`SessionEnded`. Pass the request's ``method`` too: while the list
    can't be read, a read goes on and anything else is refused with reason
    ``revocations_unavailable``; with no method, a request counts as a write.
    """
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
        try:
            key = _session_keys.get(kid)
        except (httpx.HTTPError, ValueError) as err:
            raise InvalidSession("key_set_unavailable") from err
        retired_at = _session_keys.retired_at(kid)
    if key is None:
        raise InvalidSession("unknown_key")
    try:
        key.verify(signature, f"{parts[0]}.{parts[1]}".encode("ascii"))
    except InvalidSignature as err:
        raise InvalidSession("signature") from err

    if payload.get("iss") != issuer:
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

    if revocations is not None:
        token_aud = aud if isinstance(aud, str) else None
        state = revocations.status(payload.get("rh"), token_aud, iat)
        if state == "revoked":
            raise SessionEnded()
        if state == "unverified" and (method or "").upper() not in _SAFE_METHODS:
            raise InvalidSession("revocations_unavailable")

    # Who may sign in: an explicit requirement wins over the project's.
    need = _need_from(require_bond) if require_bond is not None else (policy.requirement() if policy else None)
    if need is not None and not bond_meets(
        payload,
        min_sats=need.get("min_sats", 0),
        min_days=need.get("min_days", 0),
        max_age_secs=need.get("max_age_secs"),
    ):
        backing = read_bond_claim(payload)
        floors = (
            {"sats_floor": int(backing["sats_floor"]), "days_floor": int(backing["days_floor"])} if backing else None
        )
        raise BondRequired(need, floors)

    bond = payload.get("oc_bond")
    return Session(
        sub=payload["sub"],
        did_oc=payload["did_oc"],
        jti=payload["jti"],
        aud=list(aud) if isinstance(aud, list) else str(aud),
        iat=int(iat) if iat is not None else None,
        exp=int(exp),
        oc_bond=bond if isinstance(bond, dict) else None,
        claims=payload,
    )


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
