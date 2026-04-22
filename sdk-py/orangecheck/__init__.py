"""
orangecheck — Python SDK for OrangeCheck.

Proof of Bitcoin stake for the open web. A sybil-resistance primitive for
Django, Flask, FastAPI, or anything on the Python side of the web.

Three load-bearing functions, mirroring the JS SDK:

    from orangecheck import check, verify, discover

    result = check(addr="bc1q...", min_sats=100_000, min_days=30)
    if result.ok:
        ...                                      # let them through

All functions are also available on a Client / AsyncClient for configuring
a custom API base URL, timeouts, or a shared httpx session:

    from orangecheck import Client
    oc = Client(base_url="https://my-orangecheck.example.com")
    result = oc.check(addr="bc1q...", min_sats=100_000)

    # async variant
    from orangecheck import AsyncClient
    async with AsyncClient() as oc:
        result = await oc.check(addr="bc1q...", min_sats=100_000)
"""

from .client import AsyncClient, Client
from .errors import OrangeCheckError, RateLimitError, VerificationError
from .top_level import challenge_issue, challenge_verify, check, discover, verify
from .types import (
    AttestationSummary,
    Challenge,
    ChallengeVerified,
    CheckResult,
    DiscoverResult,
    IdentityBinding,
    VerifyOutcome,
)

__all__ = [
    # Top-level functions (sync)
    "check",
    "verify",
    "discover",
    "challenge_issue",
    "challenge_verify",
    # Clients
    "Client",
    "AsyncClient",
    # Types
    "CheckResult",
    "VerifyOutcome",
    "DiscoverResult",
    "Challenge",
    "ChallengeVerified",
    "IdentityBinding",
    "AttestationSummary",
    # Errors
    "OrangeCheckError",
    "RateLimitError",
    "VerificationError",
]

__version__ = "0.1.1"
