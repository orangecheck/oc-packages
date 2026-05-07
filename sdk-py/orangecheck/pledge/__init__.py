"""
orangecheck.pledge — Python reference SDK for OC Pledge v0.1.

Mirrors the TypeScript ``@orangecheck/pledge-core`` package function-for-
function. Cross-impl conformance is pinned by the test vectors in
``oc-pledge-protocol/test-vectors/`` — both SDKs reproduce every committed
canonical message and id byte-identically.

Public surface (load-bearing):

    from orangecheck.pledge import (
        # Canonical messages + ids
        canonical_pledge_message, canonical_outcome_message,
        canonical_abandonment_message,
        compute_pledge_id, compute_outcome_id, compute_abandonment_id,

        # Validators
        validate_pledge_input, validate_outcome_input,
        validate_abandonment_input,

        # Build / verify (envelope-only — chain / relay / DNS lookups
        # are caller-supplied hooks, same as the TS SDK)
        create_pledge, verify_pledge,
        create_outcome, verify_outcome,
        create_abandonment, verify_abandonment,

        # State machine
        classify_state,

        # Bond verification
        verify_bond,

        # Resolution-grammar validation
        validate_resolution_query,

        # Errors + types
        PledgeError, ENVELOPE_VERSION,
    )

The package does NOT bundle a Bitcoin RPC client, a Nostr relay client,
HTTP / DNS clients, or BIP-322 signing. Caller-supplied adapters keep the
SDK runtime-agnostic — same shape as the TypeScript counterpart.
"""

from .canonical import (
    ABANDONMENT_DOMAIN,
    AbandonmentCanonicalInput,
    ENVELOPE_VERSION,
    OUTCOME_DOMAIN,
    OutcomeCanonicalInput,
    OutcomeEvidence,
    PLEDGE_DOMAIN,
    PledgeBond,
    PledgeCanonicalInput,
    PledgeDispute,
    PledgeResolution,
    PledgeResolvesAt,
    ResolvesAtBlock,
    ResolvesAtTime,
    abandonment_input_from_dict,
    canonical_abandonment_message,
    canonical_abandonment_message_bytes,
    canonical_outcome_message,
    canonical_outcome_message_bytes,
    canonical_pledge_message,
    canonical_pledge_message_bytes,
    canonicalize_envelope,
    compute_abandonment_id,
    compute_outcome_id,
    compute_pledge_id,
    generate_nonce,
    outcome_input_from_dict,
    pledge_input_from_dict,
    validate_abandonment_input,
    validate_outcome_input,
    validate_pledge_input,
)
from .bond import AttestationLookupResult, verify_bond
from .envelopes import (
    PledgeError,
    create_abandonment,
    create_outcome,
    create_pledge,
    outcome_requires_signature,
    verify_abandonment,
    verify_outcome,
    verify_pledge,
    wrap_abandonment_envelope,
    wrap_outcome_envelope,
    wrap_pledge_envelope,
)
from .resolution import validate_resolution_query
from .state import classify_state, outcomes_contradict

__all__ = [
    # Domain separators
    "PLEDGE_DOMAIN",
    "OUTCOME_DOMAIN",
    "ABANDONMENT_DOMAIN",
    "ENVELOPE_VERSION",
    # Canonical inputs / shapes
    "PledgeBond",
    "PledgeCanonicalInput",
    "PledgeDispute",
    "PledgeResolution",
    "PledgeResolvesAt",
    "ResolvesAtBlock",
    "ResolvesAtTime",
    "OutcomeCanonicalInput",
    "OutcomeEvidence",
    "AbandonmentCanonicalInput",
    # Canonical builders
    "canonical_pledge_message",
    "canonical_pledge_message_bytes",
    "canonical_outcome_message",
    "canonical_outcome_message_bytes",
    "canonical_abandonment_message",
    "canonical_abandonment_message_bytes",
    "canonicalize_envelope",
    # Id computation
    "compute_pledge_id",
    "compute_outcome_id",
    "compute_abandonment_id",
    # Validators
    "validate_pledge_input",
    "validate_outcome_input",
    "validate_abandonment_input",
    # Dict adapters (JSON / vector loading)
    "pledge_input_from_dict",
    "outcome_input_from_dict",
    "abandonment_input_from_dict",
    # Helpers
    "generate_nonce",
    # Build / verify
    "create_pledge",
    "verify_pledge",
    "create_outcome",
    "verify_outcome",
    "create_abandonment",
    "verify_abandonment",
    "outcome_requires_signature",
    # Wrap helpers — for callers signing externally (server-side HSM,
    # off-host signers) who want SDK-built envelopes without supplying
    # a Bip322Signer callback.
    "wrap_pledge_envelope",
    "wrap_outcome_envelope",
    "wrap_abandonment_envelope",
    # State + bond + resolution
    "classify_state",
    "outcomes_contradict",
    "verify_bond",
    "AttestationLookupResult",
    "validate_resolution_query",
    # Errors
    "PledgeError",
]
