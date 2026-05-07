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

from .canonical import (
    IdentityBinding as CanonicalIdentityBinding,
    attestation_id,
    build_canonical_message,
    format_identities,
    parse_identities,
    random_nonce,
    score_v0,
)

# Local BIP-322 verification is optional (requires the `bip322` extra).
# Expose the function when available; absent otherwise.
try:
    from .verify_sig import verify_bip322_signature
except ImportError:  # pragma: no cover - optional-dep path
    verify_bip322_signature = None  # type: ignore[assignment]
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
    # Canonical / offline protocol primitives
    "build_canonical_message",
    "attestation_id",
    "format_identities",
    "parse_identities",
    "random_nonce",
    "score_v0",
    "CanonicalIdentityBinding",
    # Local BIP-322 verification (requires the `[verify]` extra at install time;
    # the name is re-exported as None when the extra isn't installed so callers
    # can check `if verify_bip322_signature is not None`).
    "verify_bip322_signature",
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

__version__ = "0.2.0"

# OC Pledge submodule — sibling primitive for forward-looking commitments
# bound to a Bitcoin address. Imported here so consumers can write:
#
#     from orangecheck import pledge
#     env = pledge.create_pledge(...)
#
# or attribute access via `orangecheck.pledge.canonical_pledge_message(...)`.
from . import pledge as pledge  # noqa: E402, F401
