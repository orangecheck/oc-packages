"""
Client class for the OrangeCheck Python SDK.

Wraps the hosted ochk.io API. Provides both sync and async variants so
callers can pick whichever their framework expects.
"""

from __future__ import annotations

from typing import Any

import httpx

from .errors import OrangeCheckError, RateLimitError, VerificationError
from .types import (
    AttestationSummary,
    Challenge,
    ChallengeVerified,
    CheckResult,
    DiscoverResult,
    IdentityBinding,
    VerifyOutcome,
)

DEFAULT_BASE_URL = "https://ochk.io"
DEFAULT_TIMEOUT = 10.0
DEFAULT_UA = "orangecheck-py/0.1.0"


def _raise_for_status(status: int, body: Any) -> None:
    if status == 429:
        raise RateLimitError("rate limited", status=status, body=body)
    if status == 404:
        raise OrangeCheckError("not found", status=status, body=body)
    if status >= 400:
        err = "server error"
        if isinstance(body, dict):
            err = body.get("error") or body.get("reason") or err
        raise OrangeCheckError(err, status=status, body=body)


class _Common:
    """Shared helpers for the sync and async clients."""

    def __init__(self, base_url: str = DEFAULT_BASE_URL, *, timeout: float = DEFAULT_TIMEOUT):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    @staticmethod
    def _check_params(
        *,
        addr: str | None,
        id: str | None,
        identity: str | IdentityBinding | None,
        min_sats: int | None,
        min_days: int | None,
    ) -> dict[str, str]:
        if not (addr or id or identity):
            raise ValueError("must provide addr, id, or identity")

        q: dict[str, str] = {}
        if addr:
            q["addr"] = addr
        elif id:
            q["id"] = id
        elif identity:
            if isinstance(identity, IdentityBinding):
                q["identity"] = f"{identity.protocol}:{identity.identifier}"
            else:
                q["identity"] = identity
        if min_sats is not None:
            q["min_sats"] = str(int(min_sats))
        if min_days is not None:
            q["min_days"] = str(int(min_days))
        return q

    @staticmethod
    def _discover_params(
        *,
        addr: str | None,
        id: str | None,
        identity: str | IdentityBinding | None,
        limit: int | None,
    ) -> dict[str, str]:
        if not (addr or id or identity):
            raise ValueError("must provide addr, id, or identity")
        q: dict[str, str] = {}
        if addr:
            q["addr"] = addr
        elif id:
            q["id"] = id
        elif identity:
            if isinstance(identity, IdentityBinding):
                q["identity"] = f"{identity.protocol}:{identity.identifier}"
            else:
                q["identity"] = identity
        if limit is not None:
            q["limit"] = str(int(limit))
        return q

    @staticmethod
    def _challenge_params(
        *,
        addr: str,
        audience: str | None,
        purpose: str | None,
        ttl: int | None,
    ) -> dict[str, str]:
        if not addr:
            raise ValueError("addr is required")
        q: dict[str, str] = {"addr": addr}
        if audience:
            q["audience"] = audience
        if purpose:
            q["purpose"] = purpose
        if ttl is not None:
            q["ttl"] = str(int(ttl))
        return q

    @staticmethod
    def _headers() -> dict[str, str]:
        return {"User-Agent": DEFAULT_UA, "Accept": "application/json"}


class Client(_Common):
    """Synchronous OrangeCheck client. One per thread."""

    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        *,
        timeout: float = DEFAULT_TIMEOUT,
        session: httpx.Client | None = None,
    ):
        super().__init__(base_url, timeout=timeout)
        self._session = session or httpx.Client(timeout=timeout, headers=self._headers())

    def close(self) -> None:
        self._session.close()

    def __enter__(self) -> "Client":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def _get(self, path: str, params: dict[str, str] | None = None) -> Any:
        r = self._session.get(f"{self.base_url}{path}", params=params)
        body: Any
        try:
            body = r.json()
        except ValueError:
            body = r.text
        if r.status_code != 200:
            _raise_for_status(r.status_code, body)
        return body

    def _post(self, path: str, body: dict[str, Any]) -> Any:
        r = self._session.post(
            f"{self.base_url}{path}",
            json=body,
            headers={"Content-Type": "application/json"},
        )
        try:
            out = r.json()
        except ValueError:
            out = r.text
        if r.status_code not in (200, 401):
            _raise_for_status(r.status_code, out)
        return r.status_code, out

    # --- Public methods ----------------------------------------------------

    def check(
        self,
        *,
        addr: str | None = None,
        id: str | None = None,
        identity: str | IdentityBinding | None = None,
        min_sats: int | None = None,
        min_days: int | None = None,
    ) -> CheckResult:
        """Look up the most recent attestation for a subject and gate it against thresholds."""
        try:
            body = self._get("/api/check", self._check_params(
                addr=addr, id=id, identity=identity, min_sats=min_sats, min_days=min_days
            ))
        except OrangeCheckError as e:
            # /api/check returns 404 when no attestation exists; surface as a
            # "not found" CheckResult rather than an exception so callers can
            # gate on result.ok without catching.
            if e.status == 404 and isinstance(e.body, dict):
                return CheckResult.from_json({"ok": False, **e.body})
            raise
        return CheckResult.from_json(body)

    def verify(
        self,
        *,
        addr: str,
        msg: str,
        sig: str,
        scheme: str = "bip322",
    ) -> VerifyOutcome:
        """Verify a raw ``(addr, msg, sig)`` attestation against live chain state."""
        _, body = self._post(
            "/api/verify",
            {"addr": addr, "msg": msg, "sig": sig, "scheme": scheme},
        )
        return VerifyOutcome.from_json(body)

    def discover(
        self,
        *,
        addr: str | None = None,
        id: str | None = None,
        identity: str | IdentityBinding | None = None,
        limit: int | None = None,
    ) -> DiscoverResult:
        """List attestations known for a subject."""
        body = self._get("/api/discover", self._discover_params(
            addr=addr, id=id, identity=identity, limit=limit
        ))
        return DiscoverResult.from_json(body)

    def challenge_issue(
        self,
        *,
        addr: str,
        audience: str | None = None,
        purpose: str | None = None,
        ttl: int | None = None,
    ) -> Challenge:
        """Mint a short-lived signed-challenge message."""
        body = self._get(
            "/api/challenge",
            self._challenge_params(addr=addr, audience=audience, purpose=purpose, ttl=ttl),
        )
        return Challenge.from_json(body)

    def challenge_verify(
        self,
        *,
        message: str,
        signature: str,
        scheme: str = "bip322",
        expected_nonce: str | None = None,
        expected_audience: str | None = None,
        expected_purpose: str | None = None,
    ) -> ChallengeVerified:
        """Verify a signed challenge. Raises :class:`VerificationError` on failure."""
        body: dict[str, Any] = {
            "message": message,
            "signature": signature,
            "scheme": scheme,
        }
        if expected_nonce:
            body["expectedNonce"] = expected_nonce
        if expected_audience:
            body["expectedAudience"] = expected_audience
        if expected_purpose:
            body["expectedPurpose"] = expected_purpose

        status, resp = self._post("/api/challenge", body)
        if status == 200 and isinstance(resp, dict) and resp.get("ok"):
            return ChallengeVerified.from_json(resp)
        reason = resp.get("reason") if isinstance(resp, dict) else "unknown"
        raise VerificationError(
            f"challenge verification failed: {reason}", status=status, body=resp
        )


class AsyncClient(_Common):
    """Async variant. One per event loop."""

    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        *,
        timeout: float = DEFAULT_TIMEOUT,
        session: httpx.AsyncClient | None = None,
    ):
        super().__init__(base_url, timeout=timeout)
        self._session = session or httpx.AsyncClient(
            timeout=timeout, headers=self._headers()
        )

    async def aclose(self) -> None:
        await self._session.aclose()

    async def __aenter__(self) -> "AsyncClient":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.aclose()

    async def _get(self, path: str, params: dict[str, str] | None = None) -> Any:
        r = await self._session.get(f"{self.base_url}{path}", params=params)
        try:
            body = r.json()
        except ValueError:
            body = r.text
        if r.status_code != 200:
            _raise_for_status(r.status_code, body)
        return body

    async def _post(self, path: str, body: dict[str, Any]) -> Any:
        r = await self._session.post(
            f"{self.base_url}{path}",
            json=body,
            headers={"Content-Type": "application/json"},
        )
        try:
            out = r.json()
        except ValueError:
            out = r.text
        if r.status_code not in (200, 401):
            _raise_for_status(r.status_code, out)
        return r.status_code, out

    async def check(
        self,
        *,
        addr: str | None = None,
        id: str | None = None,
        identity: str | IdentityBinding | None = None,
        min_sats: int | None = None,
        min_days: int | None = None,
    ) -> CheckResult:
        try:
            body = await self._get("/api/check", self._check_params(
                addr=addr, id=id, identity=identity, min_sats=min_sats, min_days=min_days
            ))
        except OrangeCheckError as e:
            if e.status == 404 and isinstance(e.body, dict):
                return CheckResult.from_json({"ok": False, **e.body})
            raise
        return CheckResult.from_json(body)

    async def verify(
        self,
        *,
        addr: str,
        msg: str,
        sig: str,
        scheme: str = "bip322",
    ) -> VerifyOutcome:
        _, body = await self._post(
            "/api/verify", {"addr": addr, "msg": msg, "sig": sig, "scheme": scheme}
        )
        return VerifyOutcome.from_json(body)

    async def discover(
        self,
        *,
        addr: str | None = None,
        id: str | None = None,
        identity: str | IdentityBinding | None = None,
        limit: int | None = None,
    ) -> DiscoverResult:
        body = await self._get("/api/discover", self._discover_params(
            addr=addr, id=id, identity=identity, limit=limit
        ))
        return DiscoverResult.from_json(body)

    async def challenge_issue(
        self,
        *,
        addr: str,
        audience: str | None = None,
        purpose: str | None = None,
        ttl: int | None = None,
    ) -> Challenge:
        body = await self._get(
            "/api/challenge",
            self._challenge_params(addr=addr, audience=audience, purpose=purpose, ttl=ttl),
        )
        return Challenge.from_json(body)

    async def challenge_verify(
        self,
        *,
        message: str,
        signature: str,
        scheme: str = "bip322",
        expected_nonce: str | None = None,
        expected_audience: str | None = None,
        expected_purpose: str | None = None,
    ) -> ChallengeVerified:
        body: dict[str, Any] = {
            "message": message,
            "signature": signature,
            "scheme": scheme,
        }
        if expected_nonce:
            body["expectedNonce"] = expected_nonce
        if expected_audience:
            body["expectedAudience"] = expected_audience
        if expected_purpose:
            body["expectedPurpose"] = expected_purpose

        status, resp = await self._post("/api/challenge", body)
        if status == 200 and isinstance(resp, dict) and resp.get("ok"):
            return ChallengeVerified.from_json(resp)
        reason = resp.get("reason") if isinstance(resp, dict) else "unknown"
        raise VerificationError(
            f"challenge verification failed: {reason}", status=status, body=resp
        )


# Make the classes accessible under an unused-name alias so `AttestationSummary`
# shows up in the type stubs generated from this module.
_ = AttestationSummary
