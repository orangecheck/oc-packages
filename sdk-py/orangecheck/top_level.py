"""
Module-level convenience wrappers.

Most callers don't need a dedicated Client instance — they just want::

    from orangecheck import check
    result = check(addr="bc1q...", min_sats=100_000)

Each of these functions spins up a default ``Client`` under the hood. For
long-running apps that care about connection reuse, make your own ``Client``.
"""

from __future__ import annotations

from .client import Client
from .types import (
    Challenge,
    ChallengeVerified,
    CheckResult,
    DiscoverResult,
    IdentityBinding,
    VerifyOutcome,
)


def check(
    *,
    addr: str | None = None,
    id: str | None = None,
    identity: str | IdentityBinding | None = None,
    min_sats: int | None = None,
    min_days: int | None = None,
    base_url: str | None = None,
) -> CheckResult:
    with _client(base_url) as c:
        return c.check(
            addr=addr, id=id, identity=identity, min_sats=min_sats, min_days=min_days
        )


def verify(
    *,
    addr: str,
    msg: str,
    sig: str,
    scheme: str = "bip322",
    base_url: str | None = None,
) -> VerifyOutcome:
    with _client(base_url) as c:
        return c.verify(addr=addr, msg=msg, sig=sig, scheme=scheme)


def discover(
    *,
    addr: str | None = None,
    id: str | None = None,
    identity: str | IdentityBinding | None = None,
    limit: int | None = None,
    base_url: str | None = None,
) -> DiscoverResult:
    with _client(base_url) as c:
        return c.discover(addr=addr, id=id, identity=identity, limit=limit)


def challenge_issue(
    *,
    addr: str,
    audience: str | None = None,
    purpose: str | None = None,
    ttl: int | None = None,
    base_url: str | None = None,
) -> Challenge:
    with _client(base_url) as c:
        return c.challenge_issue(addr=addr, audience=audience, purpose=purpose, ttl=ttl)


def challenge_verify(
    *,
    message: str,
    signature: str,
    scheme: str = "bip322",
    expected_nonce: str | None = None,
    expected_audience: str | None = None,
    expected_purpose: str | None = None,
    base_url: str | None = None,
) -> ChallengeVerified:
    with _client(base_url) as c:
        return c.challenge_verify(
            message=message,
            signature=signature,
            scheme=scheme,
            expected_nonce=expected_nonce,
            expected_audience=expected_audience,
            expected_purpose=expected_purpose,
        )


def _client(base_url: str | None) -> Client:
    if base_url:
        return Client(base_url=base_url)
    return Client()
