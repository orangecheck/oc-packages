"""
orangecheck — Python SDK for OrangeCheck.

Proof of Bitcoin stake for the open web. A sybil-resistance primitive for
Django, Flask, FastAPI, or anything on the Python side of the web.

Three load-bearing functions, mirroring the JS SDK:

    from orangecheck import check, verify, discover

    result = check(addr="bc1q...", min_sats=100_000, min_days=30)
    if result.ok:
        ...                                      # let them through

All functions are also available on the Client class for configuring a
custom API base URL, timeouts, or a shared httpx session:

    from orangecheck import Client
    oc = Client(base_url="https://my-orangecheck.example.com")
    await oc.check_async(addr="bc1q...", min_sats=100_000)
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

__version__ = "0.1.0"
