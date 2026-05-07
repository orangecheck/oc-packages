"""
Build + verify functions for the three OC Pledge envelope kinds.

Mirrors the TS SDK's pledge.ts / outcome.ts / abandonment.ts. All BIP-322
signing and verification is performed via caller-supplied callables — the
SDK never imports a wallet adapter directly. This keeps the package
runtime-agnostic; callers wire ``orangecheck.verify_sig.verify_bip322_signature``
or any other adapter of choice.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Literal, Optional, Protocol, Union

from .canonical import (
    AbandonmentCanonicalInput,
    ENVELOPE_VERSION,
    canonical_abandonment_message,
    canonical_outcome_message,
    canonical_pledge_message,
    compute_abandonment_id,
    compute_outcome_id,
    compute_pledge_id,
    validate_abandonment_input,
    validate_outcome_input,
    validate_pledge_input,
)

# ─── Error class ──────────────────────────────────────────────────────────

PledgeErrorCode = Literal[
    "E_UNSUPPORTED_VERSION",
    "E_PLEDGE_MALFORMED",
    "E_PLEDGE_BAD_ID",
    "E_PLEDGE_BAD_SIG",
    "E_RESOLUTION_UNKNOWN",
    "E_RESOLUTION_NONDETERMINISTIC",
    "E_BOND_NOT_FOUND",
    "E_BOND_ADDRESS_MISMATCH",
    "E_BOND_SPENT",
    "E_BOND_INSUFFICIENT_SATS",
    "E_BOND_INSUFFICIENT_DAYS",
    "E_OUTCOME_MALFORMED",
    "E_OUTCOME_BAD_ID",
    "E_OUTCOME_BAD_SIG",
    "E_OUTCOME_EVIDENCE_MISMATCH",
    "E_OUTCOME_RESOLVER_UNAUTHORIZED",
    "E_ABANDONMENT_MALFORMED",
    "E_ABANDONMENT_BAD_ID",
    "E_ABANDONMENT_BAD_SIG",
    "E_DELEGATION_NOT_FOUND",
    "E_DELEGATION_SCOPE_VIOLATED",
    "E_DELEGATION_EXPIRED",
]


class PledgeError(Exception):
    """Raised by ``create_pledge`` / ``create_outcome`` / ``create_abandonment``
    on malformed inputs. The ``code`` attribute carries the SPEC §10 error
    code; the ``str(err)`` form carries the human-readable reason."""

    def __init__(self, code: PledgeErrorCode, message: str) -> None:
        super().__init__(message)
        self.code: PledgeErrorCode = code


# ─── Signer / verifier hook protocols ─────────────────────────────────────


class Bip322Signer(Protocol):
    """Caller-supplied signer adapter. ``address`` is the Bitcoin address
    the wallet signs for; ``sign_message(msg)`` returns a base64 BIP-322
    signature over the UTF-8 bytes of ``msg``.
    """

    address: str

    def sign_message(self, msg: str) -> str: ...  # pragma: no cover - protocol shape


VerifyBip322 = Callable[[str, str, str], bool]
"""Caller-supplied BIP-322 verifier. Returns True iff ``sig_b64`` verifies
under ``address`` over the UTF-8 bytes of ``msg``. Synchronous flavour —
mirrors the Python ecosystem's typical sig-verify shape (the TS SDK uses
``Promise<boolean>`` because of browser BIP-322 libs being async)."""


# ─── Verify result types ──────────────────────────────────────────────────


@dataclass(frozen=True)
class VerifyOk:
    ok: Literal[True]
    envelope: dict[str, Any]
    canonical_message: str
    id: str


@dataclass(frozen=True)
class VerifyErr:
    ok: Literal[False]
    code: PledgeErrorCode
    message: str


VerifyResult = Union[VerifyOk, VerifyErr]


def _err(code: PledgeErrorCode, message: str) -> VerifyErr:
    return VerifyErr(ok=False, code=code, message=message)


# ─── Pledge — create + verify (SPEC §3 + §9) ──────────────────────────────


def create_pledge(
    *,
    swearer: str,
    proposition: str,
    resolution: dict[str, str],
    resolves_at: dict[str, Any],
    expires_at: str,
    bond: dict[str, Any],
    counterparty: Optional[str],
    dispute: dict[str, Any],
    sworn_at: str,
    nonce: str,
    swearer_signer: Bip322Signer,
    via_delegation: Optional[dict[str, Any]] = None,
    remediation: Literal["breach_recorded"] = "breach_recorded",
) -> dict[str, Any]:
    """
    Build, validate, and sign a pledge envelope.

    Two signing paths:
      * Direct: ``swearer_signer`` is the swearer's wallet; the swearer
        address signs the lowercase-hex pledge id.
      * Agent (``via_delegation`` non-None): the agent in
        ``via_delegation['agent_signer']`` signs on behalf of the principal
        named in ``swearer``. The envelope carries ``via_delegation`` and
        ``agent_address``; SPEC §7.3 says the verifier uses ``agent_address``
        as the BIP-322 verification key.

    Returns the envelope as a dict (JSON-shaped). Raises ``PledgeError`` on
    validation failure.
    """
    from .canonical import (
        PledgeBond,
        PledgeCanonicalInput,
        PledgeDispute,
        PledgeResolution,
        ResolvesAtBlock,
        ResolvesAtTime,
    )

    resolves_at_typed = (
        ResolvesAtTime(time=resolves_at["time"])
        if "time" in resolves_at
        else ResolvesAtBlock(block=int(resolves_at["block"]))
    )
    canon = PledgeCanonicalInput(
        swearer=swearer,
        proposition=proposition,
        resolution=PledgeResolution(
            mechanism=resolution["mechanism"],  # type: ignore[arg-type]
            query=resolution["query"],
        ),
        resolves_at=resolves_at_typed,
        expires_at=expires_at,
        bond=PledgeBond(
            attestation_id=bond["attestation_id"],
            min_sats=int(bond["min_sats"]),
            min_days=int(bond["min_days"]),
        ),
        counterparty=counterparty,
        dispute=PledgeDispute(
            mechanism=dispute.get("mechanism"),
            params=dispute.get("params"),
        ),
        remediation=remediation,
        sworn_at=sworn_at,
        nonce=nonce,
    )

    v = validate_pledge_input(canon)
    if not v.ok:
        raise PledgeError("E_PLEDGE_MALFORMED", v.reason)

    if via_delegation is not None:
        delegation_id = via_delegation.get("delegation_id", "")
        agent_signer: Optional[Bip322Signer] = via_delegation.get("agent_signer")
        if not isinstance(delegation_id, str) or len(delegation_id) != 64:
            raise PledgeError(
                "E_PLEDGE_MALFORMED",
                "via_delegation.delegation_id must be 64 hex chars",
            )
        if agent_signer is None or agent_signer.address == swearer_signer.address:
            raise PledgeError(
                "E_PLEDGE_MALFORMED",
                "agent_address must differ from swearer.address (principal-vs-agent invariant)",
            )

    pledge_id = compute_pledge_id(canon)

    # SPEC §3.5: BIP-322 commits to lowercase hex of the id, NOT the
    # canonical-message bytes. Hex chosen so wallet UIs render legible text
    # to the user before signing.
    signer = via_delegation["agent_signer"] if via_delegation else swearer_signer
    sig_value = signer.sign_message(pledge_id)

    envelope: dict[str, Any] = {
        "v": ENVELOPE_VERSION,
        "kind": "pledge",
        "id": pledge_id,
        "swearer": {"address": swearer, "alg": "bip322"},
        "proposition": proposition,
        "resolution": {
            "mechanism": canon.resolution.mechanism,
            "query": canon.resolution.query,
        },
        "resolves_at": {"time": resolves_at["time"]} if "time" in resolves_at else {"block": int(resolves_at["block"])},
        "expires_at": expires_at,
        "bond": {
            "attestation_id": canon.bond.attestation_id,
            "min_sats": canon.bond.min_sats,
            "min_days": canon.bond.min_days,
        },
        "counterparty": counterparty,
        "dispute": {
            "mechanism": canon.dispute.mechanism,
            "params": canon.dispute.params,
        },
        "remediation": remediation,
        "sworn_at": sworn_at,
        "nonce": nonce,
        "sig": {
            "alg": "bip322",
            "pubkey": signer.address,
            "value": sig_value,
        },
    }

    if via_delegation is not None:
        envelope["via_delegation"] = via_delegation["delegation_id"]
        envelope["agent_address"] = via_delegation["agent_signer"].address

    return envelope


def verify_pledge(
    envelope: dict[str, Any],
    verify_bip322: Optional[VerifyBip322] = None,
    skip_signature_verification: bool = False,
) -> VerifyResult:
    """
    Envelope-only verify per SPEC §9.1 steps 1–4.

    Bond verification (§9.1.5), outcome / abandonment side-channel checks,
    and mechanism re-evaluation against public state (§9.1.8) are out of
    scope for this function — see ``verify_bond`` and the per-envelope-kind
    ``verify_outcome`` / ``verify_abandonment`` for those layers.

    ``skip_signature_verification=True`` is the test-vector path (placeholder
    sigs); production callers MUST supply ``verify_bip322``.
    """
    if envelope.get("v") != ENVELOPE_VERSION:
        return _err("E_UNSUPPORTED_VERSION", f"pledge envelope v={envelope.get('v')!r} not supported")

    shape = _check_pledge_shape(envelope)
    if shape:
        return shape

    from .canonical import pledge_input_from_dict

    try:
        canon = pledge_input_from_dict(_pledge_canon_dict_from_envelope(envelope))
    except (KeyError, TypeError, ValueError) as e:
        return _err("E_PLEDGE_MALFORMED", f"could not parse envelope canonical inputs: {e}")

    field_check = validate_pledge_input(canon)
    if not field_check.ok:
        return _err("E_PLEDGE_MALFORMED", field_check.reason)

    canonical_message = canonical_pledge_message(canon)
    reconstructed_id = compute_pledge_id(canon)
    declared_id = envelope["id"]
    if reconstructed_id != declared_id:
        return _err(
            "E_PLEDGE_BAD_ID",
            f"reconstructed id {reconstructed_id} != envelope.id {declared_id}",
        )

    if not skip_signature_verification:
        if verify_bip322 is None:
            return _err("E_PLEDGE_BAD_SIG", "no BIP-322 verifier supplied")
        # SPEC §7.3 step 6: when via_delegation is present, the verification
        # key is the agent_address (NOT sig.pubkey).
        sig = envelope["sig"]
        verify_key: str = (
            envelope["agent_address"]
            if envelope.get("via_delegation") and envelope.get("agent_address")
            else sig["pubkey"]
        )
        if not verify_bip322(envelope["id"], sig["value"], verify_key):
            return _err("E_PLEDGE_BAD_SIG", "BIP-322 signature did not verify")

    return VerifyOk(
        ok=True, envelope=envelope, canonical_message=canonical_message, id=declared_id
    )


def _pledge_canon_dict_from_envelope(env: dict[str, Any]) -> dict[str, Any]:
    """Project the canonical-input fields out of an envelope (the envelope
    has extra fields like ``v`` / ``kind`` / ``id`` / ``sig`` that the
    canonical input doesn't carry)."""
    return {
        "swearer": env["swearer"]["address"],
        "proposition": env["proposition"],
        "resolution": env["resolution"],
        "resolves_at": env["resolves_at"],
        "expires_at": env["expires_at"],
        "bond": env["bond"],
        "counterparty": env.get("counterparty"),
        "dispute": env["dispute"],
        "sworn_at": env["sworn_at"],
        "nonce": env["nonce"],
    }


def _check_pledge_shape(env: dict[str, Any]) -> Optional[VerifyErr]:
    if env.get("kind") != "pledge":
        return _err("E_PLEDGE_MALFORMED", 'envelope.kind must be "pledge"')
    eid = env.get("id")
    if not isinstance(eid, str) or len(eid) != 64 or any(c not in "0123456789abcdef" for c in eid):
        return _err("E_PLEDGE_MALFORMED", "envelope.id must be 64 lowercase hex chars")
    swearer = env.get("swearer")
    if not isinstance(swearer, dict) or swearer.get("alg") != "bip322" or not isinstance(swearer.get("address"), str):
        return _err("E_PLEDGE_MALFORMED", "envelope.swearer invalid")
    resolution = env.get("resolution")
    if not isinstance(resolution, dict) or not isinstance(resolution.get("mechanism"), str):
        return _err("E_PLEDGE_MALFORMED", "envelope.resolution invalid")
    rtype = env.get("resolves_at")
    if not isinstance(rtype, dict) or len(rtype) != 1 or (("time" not in rtype) and ("block" not in rtype)):
        return _err(
            "E_PLEDGE_MALFORMED",
            "envelope.resolves_at must contain exactly one of {time} or {block}",
        )
    bond = env.get("bond")
    if not isinstance(bond, dict) or not isinstance(bond.get("attestation_id"), str):
        return _err("E_PLEDGE_MALFORMED", "envelope.bond invalid")
    dispute = env.get("dispute")
    if not isinstance(dispute, dict):
        return _err("E_PLEDGE_MALFORMED", "envelope.dispute must be an object")
    if env.get("remediation") != "breach_recorded":
        return _err("E_PLEDGE_MALFORMED", 'envelope.remediation must equal "breach_recorded" in v0.1')
    sig = env.get("sig")
    if not isinstance(sig, dict) or sig.get("alg") != "bip322" or not isinstance(sig.get("value"), str):
        return _err("E_PLEDGE_MALFORMED", "envelope.sig invalid")
    via = env.get("via_delegation")
    if via is not None:
        if not isinstance(via, str) or len(via) != 64 or any(c not in "0123456789abcdef" for c in via):
            return _err("E_PLEDGE_MALFORMED", "envelope.via_delegation must be 64 hex chars")
        if not isinstance(env.get("agent_address"), str):
            return _err(
                "E_PLEDGE_MALFORMED",
                "envelope.agent_address required when via_delegation present",
            )
        # SPEC §3.6 vs §7.3 contradiction documented in pledge-core: under
        # §7.3 the sig.pubkey is informational; the verifier uses
        # agent_address as the BIP-322 key. We accept either reading.
    else:
        if sig.get("pubkey") != swearer.get("address"):
            return _err(
                "E_PLEDGE_MALFORMED",
                "envelope.sig.pubkey must equal swearer.address when via_delegation absent",
            )
        if env.get("agent_address") is not None:
            return _err(
                "E_PLEDGE_MALFORMED",
                "envelope.agent_address must be absent when via_delegation absent",
            )
    return None


# ─── Outcome — create + verify (SPEC §4) ──────────────────────────────────


def outcome_requires_signature(input_or_envelope: dict[str, Any]) -> bool:
    """Discriminator for SPEC §4.3: signed iff resolved_by != "deterministic".

    The five deterministic mechanisms always have resolved_by="deterministic"
    and sig=null. counterparty_signs normally has resolved_by=<cp.address>
    and a signature — UNLESS the outcome is expired_unresolved, in which
    case the verifier deterministically classifies the deadline passing
    without a counterparty signature, so resolved_by="deterministic" and
    sig=null. Test vector v16 pins this nuance.
    """
    return input_or_envelope.get("resolved_by") != "deterministic"


def create_outcome(
    *,
    pledge_id: str,
    outcome: str,
    resolved_at: str,
    resolved_by: str,
    evidence: dict[str, str],
    dispute_window_ends_at: str,
    signer: Optional[Bip322Signer] = None,
) -> dict[str, Any]:
    from .canonical import OutcomeCanonicalInput, OutcomeEvidence

    canon = OutcomeCanonicalInput(
        pledge_id=pledge_id,
        outcome=outcome,  # type: ignore[arg-type]
        resolved_at=resolved_at,
        resolved_by=resolved_by,
        evidence=OutcomeEvidence(
            mechanism=evidence["mechanism"],  # type: ignore[arg-type]
            result=evidence["result"],
            witness=evidence["witness"],
        ),
        dispute_window_ends_at=dispute_window_ends_at,
    )

    v = validate_outcome_input(canon)
    if not v.ok:
        raise PledgeError("E_OUTCOME_MALFORMED", v.reason)

    requires_sig = resolved_by != "deterministic"
    if requires_sig:
        if signer is None:
            raise PledgeError(
                "E_OUTCOME_BAD_SIG",
                f'resolved_by="{resolved_by}" requires a signer (only resolved_by="deterministic" outcomes leave sig=null)',
            )
        if signer.address != resolved_by:
            raise PledgeError(
                "E_OUTCOME_RESOLVER_UNAUTHORIZED",
                f"signer.address ({signer.address}) must equal resolved_by ({resolved_by})",
            )

    outcome_id = compute_outcome_id(canon)

    sig_obj: Optional[dict[str, str]] = None
    if requires_sig:
        assert signer is not None
        sig_obj = {
            "alg": "bip322",
            "pubkey": signer.address,
            "value": signer.sign_message(outcome_id),
        }

    return {
        "v": ENVELOPE_VERSION,
        "kind": "pledge-outcome",
        "id": outcome_id,
        "pledge_id": pledge_id,
        "outcome": outcome,
        "resolved_at": resolved_at,
        "resolved_by": resolved_by,
        "evidence": {
            "mechanism": canon.evidence.mechanism,
            "result": canon.evidence.result,
            "witness": canon.evidence.witness,
        },
        "dispute_window_ends_at": dispute_window_ends_at,
        "sig": sig_obj,
    }


def verify_outcome(
    envelope: dict[str, Any],
    verify_bip322: Optional[VerifyBip322] = None,
    skip_signature_verification: bool = False,
) -> VerifyResult:
    if envelope.get("v") != ENVELOPE_VERSION:
        return _err("E_UNSUPPORTED_VERSION", f"outcome envelope v={envelope.get('v')!r} not supported")

    shape = _check_outcome_shape(envelope)
    if shape:
        return shape

    from .canonical import outcome_input_from_dict

    try:
        canon = outcome_input_from_dict(envelope)
    except (KeyError, TypeError, ValueError) as e:
        return _err("E_OUTCOME_MALFORMED", f"could not parse envelope: {e}")

    field_check = validate_outcome_input(canon)
    if not field_check.ok:
        return _err("E_OUTCOME_MALFORMED", field_check.reason)

    canonical_message = canonical_outcome_message(canon)
    reconstructed_id = compute_outcome_id(canon)
    if reconstructed_id != envelope["id"]:
        return _err(
            "E_OUTCOME_BAD_ID",
            f"reconstructed id {reconstructed_id} != envelope.id {envelope['id']}",
        )

    requires_sig = outcome_requires_signature(envelope)
    sig = envelope.get("sig")
    if requires_sig:
        if not isinstance(sig, dict):
            return _err(
                "E_OUTCOME_BAD_SIG",
                f'resolved_by="{envelope["resolved_by"]}" requires a signature but envelope.sig is null',
            )
        if sig.get("pubkey") != envelope["resolved_by"]:
            return _err(
                "E_OUTCOME_RESOLVER_UNAUTHORIZED",
                f"sig.pubkey ({sig.get('pubkey')}) must equal resolved_by ({envelope['resolved_by']})",
            )
        if not skip_signature_verification:
            if verify_bip322 is None:
                return _err("E_OUTCOME_BAD_SIG", "no BIP-322 verifier supplied")
            if not verify_bip322(envelope["id"], sig["value"], sig["pubkey"]):
                return _err("E_OUTCOME_BAD_SIG", "BIP-322 signature did not verify")
    else:
        if sig is not None:
            return _err(
                "E_OUTCOME_MALFORMED",
                'resolved_by="deterministic" outcomes MUST have envelope.sig = null',
            )

    return VerifyOk(
        ok=True, envelope=envelope, canonical_message=canonical_message, id=envelope["id"]
    )


def _check_outcome_shape(env: dict[str, Any]) -> Optional[VerifyErr]:
    if env.get("kind") != "pledge-outcome":
        return _err("E_OUTCOME_MALFORMED", 'envelope.kind must be "pledge-outcome"')
    eid = env.get("id")
    if not isinstance(eid, str) or len(eid) != 64:
        return _err("E_OUTCOME_MALFORMED", "envelope.id must be 64 lowercase hex chars")
    pid = env.get("pledge_id")
    if not isinstance(pid, str) or len(pid) != 64:
        return _err("E_OUTCOME_MALFORMED", "envelope.pledge_id must be 64 lowercase hex chars")
    ev = env.get("evidence")
    if not isinstance(ev, dict) or not isinstance(ev.get("mechanism"), str):
        return _err("E_OUTCOME_MALFORMED", "envelope.evidence invalid")
    return None


# ─── Abandonment — create + verify (SPEC §5) ──────────────────────────────


def create_abandonment(
    *,
    pledge_id: str,
    abandoned_at: str,
    reason: str,
    swearer_signer: Bip322Signer,
) -> dict[str, Any]:
    canon = AbandonmentCanonicalInput(
        pledge_id=pledge_id, abandoned_at=abandoned_at, reason=reason
    )
    v = validate_abandonment_input(canon)
    if not v.ok:
        raise PledgeError("E_ABANDONMENT_MALFORMED", v.reason)

    abandonment_id = compute_abandonment_id(canon)
    sig_value = swearer_signer.sign_message(abandonment_id)

    return {
        "v": ENVELOPE_VERSION,
        "kind": "pledge-abandonment",
        "id": abandonment_id,
        "pledge_id": pledge_id,
        "abandoned_at": abandoned_at,
        "reason": reason,
        "sig": {
            "alg": "bip322",
            "pubkey": swearer_signer.address,
            "value": sig_value,
        },
    }


def verify_abandonment(
    envelope: dict[str, Any],
    verify_bip322: Optional[VerifyBip322] = None,
    skip_signature_verification: bool = False,
) -> VerifyResult:
    if envelope.get("v") != ENVELOPE_VERSION:
        return _err(
            "E_UNSUPPORTED_VERSION",
            f"abandonment envelope v={envelope.get('v')!r} not supported",
        )

    shape = _check_abandonment_shape(envelope)
    if shape:
        return shape

    from .canonical import abandonment_input_from_dict

    try:
        canon = abandonment_input_from_dict(envelope)
    except (KeyError, TypeError, ValueError) as e:
        return _err("E_ABANDONMENT_MALFORMED", f"could not parse envelope: {e}")

    field_check = validate_abandonment_input(canon)
    if not field_check.ok:
        return _err("E_ABANDONMENT_MALFORMED", field_check.reason)

    canonical_message = canonical_abandonment_message(canon)
    reconstructed_id = compute_abandonment_id(canon)
    if reconstructed_id != envelope["id"]:
        return _err(
            "E_ABANDONMENT_BAD_ID",
            f"reconstructed id {reconstructed_id} != envelope.id {envelope['id']}",
        )

    if not skip_signature_verification:
        if verify_bip322 is None:
            return _err("E_ABANDONMENT_BAD_SIG", "no BIP-322 verifier supplied")
        sig = envelope["sig"]
        if not verify_bip322(envelope["id"], sig["value"], sig["pubkey"]):
            return _err("E_ABANDONMENT_BAD_SIG", "BIP-322 signature did not verify")

    return VerifyOk(
        ok=True, envelope=envelope, canonical_message=canonical_message, id=envelope["id"]
    )


def _check_abandonment_shape(env: dict[str, Any]) -> Optional[VerifyErr]:
    if env.get("kind") != "pledge-abandonment":
        return _err("E_ABANDONMENT_MALFORMED", 'envelope.kind must be "pledge-abandonment"')
    eid = env.get("id")
    if not isinstance(eid, str) or len(eid) != 64:
        return _err("E_ABANDONMENT_MALFORMED", "envelope.id must be 64 lowercase hex chars")
    pid = env.get("pledge_id")
    if not isinstance(pid, str) or len(pid) != 64:
        return _err("E_ABANDONMENT_MALFORMED", "envelope.pledge_id must be 64 lowercase hex chars")
    sig = env.get("sig")
    if not isinstance(sig, dict) or sig.get("alg") != "bip322" or not isinstance(sig.get("value"), str):
        return _err("E_ABANDONMENT_MALFORMED", "envelope.sig invalid")
    return None


# Async-flavour wrappers preserved for parity with the TS SDK's
# Promise-based API. Equivalent to the sync versions; the BIP-322 hook can
# still be a synchronous callable.
async def create_pledge_async(*args: Any, **kwargs: Any) -> dict[str, Any]:
    return create_pledge(*args, **kwargs)


async def verify_pledge_async(*args: Any, **kwargs: Any) -> VerifyResult:
    return verify_pledge(*args, **kwargs)
