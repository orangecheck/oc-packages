"""
Helpers for a site's own backend when it signs people in with ochk.app.

Three jobs, the same wire formats as ``@orangecheck/me-client``:

    from orangecheck import verify_session, sign_event, verify_webhook

    session = verify_session(token, audience="https://your-site.example")
    header = sign_event(signing_secret, body)          # X-OC-Signature
    event = verify_webhook(request.headers, raw_body)

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
import threading
import time
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Optional, Union

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


class InvalidSession(OrangeCheckError):
    """The sign-in token did not verify. ``reason`` says why, in one word."""

    def __init__(self, reason: str, message: str | None = None):
        super().__init__(message or f"session token refused: {reason}")
        self.reason = reason


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
            # Stale on error: a key set seen before keeps working through an outage, for a while.
            if not self._keys or time.time() - self._fetched_at >= _JWKS_MAX_STALE_SECONDS:
                raise

    def retired_at(self, kid: str) -> Optional[float]:
        return self._retired.get(kid)

    def get(self, kid: str) -> Optional[Ed25519PublicKey]:
        with self._lock:
            if not self._keys or time.time() - self._fetched_at >= _JWKS_TTL_SECONDS:
                self._fetch()
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


# ─── sign-in tokens ──────────────────────────────────────────────────────


def verify_session(
    token: str,
    audience: Union[str, list[str]],
    *,
    jwks: Optional[Mapping[str, Any]] = None,
    issuer: str = SESSION_ISSUER,
    leeway: int = 0,
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
    in until it expires (up to 30 days); it does not prove the person has not
    signed out since. Keep your own session, and see the docs on ending one.
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
