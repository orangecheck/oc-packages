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

A site that signs people in with ochk.app verifies the sign-in token, signs
billable events and checks webhooks with three more:

    from orangecheck import verify_session, sign_event, verify_webhook

A site that keeps its own login makes an orangecheck account for its user
(OC Connect) with ``connect_provision``, ``connect_claim_link`` and
``connect_delete``.
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

from .address import DecodedAddress, decode_address, normalize_address

# Local BIP-322 verification is optional (requires the `bip322` extra).
# Expose the function when available; absent otherwise.
try:
    from .verify_sig import verify_bip322_signature
except ImportError:  # pragma: no cover - optional-dep path
    verify_bip322_signature = None  # type: ignore[assignment]
from .bond import (
    BOND_DAYS_FLOORS,
    BOND_MAX_WINDOW_SECONDS,
    BOND_SATS_FLOORS,
    BondFields,
    bond_floors,
    bond_id,
    bond_nullifier,
    build_bond_message,
    parse_bond_message,
    verify_bond_signature,
)
from .client import AsyncClient, Client
from .errors import OrangeCheckError, RateLimitError, VerificationError
from .connect import (
    CONNECT_CONSENT_BLURB,
    CONNECT_CONSENT_LABEL,
    ConnectAccount,
    ConnectClaimLink,
    ConnectDeleted,
    ConnectRefusal,
    connect_claim_link,
    connect_delete,
    connect_provision,
)
from .integrator import (
    BondRequired,
    InvalidSession,
    InvalidWebhook,
    RevocationList,
    Session,
    SessionCheck,
    SessionEnded,
    SignInPolicy,
    WarmPart,
    WarmResult,
    bond_meets,
    check_oc_session,
    check_sign_in_rule,
    read_bond_claim,
    revocation_key,
    sign_event,
    verify_session,
    verify_webhook,
    warm_session,
)
from .tokens import (
    JtiStore,
    MemoryJtiStore,
    RevokeRefusal,
    TokensRevoked,
    revoke_token,
    spend_once,
    spend_once_async,
)
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
    # Addresses in the one spelling the family verifies and keys by
    "decode_address",
    "normalize_address",
    "DecodedAddress",
    # Local BIP-322 verification (requires the `[verify]` extra at install time;
    # the name is re-exported as None when the extra isn't installed so callers
    # can check `if verify_bip322_signature is not None`).
    "verify_bip322_signature",
    # Bonds (oc-attest-protocol BOND.md): one coin backing one subject
    "BondFields",
    "build_bond_message",
    "parse_bond_message",
    "bond_id",
    "bond_nullifier",
    "bond_floors",
    "verify_bond_signature",
    "BOND_SATS_FLOORS",
    "BOND_DAYS_FLOORS",
    "BOND_MAX_WINDOW_SECONDS",
    # ochk.app sign-in, billable events and webhooks, for an integrator's backend
    "verify_session",
    "check_oc_session",
    "check_sign_in_rule",
    "SessionCheck",
    "warm_session",
    "WarmResult",
    "WarmPart",
    "sign_event",
    "verify_webhook",
    "Session",
    "InvalidSession",
    "InvalidWebhook",
    "RevocationList",
    "SessionEnded",
    "revocation_key",
    "SignInPolicy",
    "BondRequired",
    "bond_meets",
    "read_bond_claim",
    # After a sign-in: one session per token, then end the token at ochk.io
    "spend_once",
    "spend_once_async",
    "JtiStore",
    "MemoryJtiStore",
    "revoke_token",
    "TokensRevoked",
    "RevokeRefusal",
    # OC Connect, for a site that keeps its own login
    "connect_provision",
    "connect_claim_link",
    "connect_delete",
    "ConnectAccount",
    "ConnectClaimLink",
    "ConnectDeleted",
    "ConnectRefusal",
    "CONNECT_CONSENT_LABEL",
    "CONNECT_CONSENT_BLURB",
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

__version__ = "3.3.0"

# OC Pledge submodule — sibling primitive for forward-looking commitments
# bound to a Bitcoin address. Imported here so consumers can write:
#
#     from orangecheck import pledge
#     env = pledge.create_pledge(...)
#
# or attribute access via `orangecheck.pledge.canonical_pledge_message(...)`.
from . import pledge as pledge  # noqa: E402, F401
