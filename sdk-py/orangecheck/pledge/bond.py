"""
Bond verification — SPEC §8.

Mirrors the TS SDK's verifyBond. The SDK ships the algorithm; the chain
accessor (``AttestationLookup``) is supplied by the caller. No bundled
Bitcoin RPC client by design — the caller wires Esplora, mempool.space,
bitcoind, ``orangecheck.check``, or whatever fits their runtime.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Literal, Optional, Union


@dataclass(frozen=True)
class AttestationLookupResult:
    """Resolved attestation state at the verifier's clock."""

    address: str
    sats_bonded: int
    days_unspent: int
    utxo_spent_at_or_before_now: bool


# Synchronous and async lookup callables both supported.
AttestationLookup = Callable[
    [str, str], "Union[Optional[AttestationLookupResult], Awaitable[Optional[AttestationLookupResult]]]"
]


@dataclass(frozen=True)
class VerifyBondOk:
    ok: Literal[True]
    sats_bonded: int
    days_unspent: int


@dataclass(frozen=True)
class VerifyBondErr:
    ok: Literal[False]
    code: Literal[
        "E_BOND_NOT_FOUND",
        "E_BOND_ADDRESS_MISMATCH",
        "E_BOND_SPENT",
        "E_BOND_INSUFFICIENT_SATS",
        "E_BOND_INSUFFICIENT_DAYS",
    ]
    message: str


VerifyBondResult = Union[VerifyBondOk, VerifyBondErr]


def _err(code: Any, message: str) -> VerifyBondErr:
    return VerifyBondErr(ok=False, code=code, message=message)


def verify_bond(
    *,
    pledge: dict[str, Any],
    now: str,
    attestation: Optional[AttestationLookupResult],
) -> VerifyBondResult:
    """Synchronous bond verification.

    Unlike the TS SDK's ``verifyBond`` which takes an async ``lookup``, the
    Python flavour takes a pre-resolved ``attestation`` (or ``None``) so
    callers can keep their lookup synchronous OR pre-resolve it. The
    decision tree (§8) is identical.
    """
    if attestation is None:
        return _err("E_BOND_NOT_FOUND", f"attestation {pledge['bond']['attestation_id']} not found")

    swearer_address: str = pledge["swearer"]["address"]
    if attestation.address != swearer_address:
        return _err(
            "E_BOND_ADDRESS_MISMATCH",
            f"attestation.address ({attestation.address}) != pledge.swearer.address ({swearer_address})",
        )

    if attestation.utxo_spent_at_or_before_now:
        return _err("E_BOND_SPENT", "bonded UTXO spent at or before verifier now")

    bond = pledge["bond"]
    if attestation.sats_bonded < int(bond["min_sats"]):
        return _err(
            "E_BOND_INSUFFICIENT_SATS",
            f"sats_bonded ({attestation.sats_bonded}) < min_sats ({bond['min_sats']})",
        )

    if attestation.days_unspent < int(bond["min_days"]):
        return _err(
            "E_BOND_INSUFFICIENT_DAYS",
            f"days_unspent ({attestation.days_unspent}) < min_days ({bond['min_days']})",
        )

    # Mark `now` as intentionally unused at the algorithm level — `now` is
    # already baked into the `attestation_lookup` semantics by the caller
    # (sats_bonded / days_unspent are clock-relative). Keeping `now` in the
    # signature for parity with the TS SDK's `verifyBond({pledge, now, lookup})`.
    _ = now

    return VerifyBondOk(ok=True, sats_bonded=attestation.sats_bonded, days_unspent=attestation.days_unspent)
