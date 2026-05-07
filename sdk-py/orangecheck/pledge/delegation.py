"""
OC Agent §7.3 delegation checks for agent-delegated pledges.

Mirrors @orangecheck/pledge-core@0.2.0's src/delegation.ts. Same scope
grammar, same constraint-matching semantics. The fetch + verifyDelegation
side is the caller's responsibility (typically delegated to the OC Agent
Python SDK or the hosted resolver); this module does the pledge-specific
scope-matching against the resolved delegation result.

The pledge:create scope grammar (SPEC §7.3):

    pledge:create
    pledge:create(max_bond_sats=<N>)
    pledge:create(mechanism=<m>)
    pledge:create(counterparty=<addr>)
    pledge:create(max_bond_sats=<N>,mechanism=<m>)

Multiple constraints comma-separated; AND-joined.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Literal, Optional, Union

from .envelopes import PledgeError, PledgeErrorCode


@dataclass(frozen=True)
class DelegationLookupResult:
    """Resolved fields from an OC Agent delegation envelope."""

    principal: str
    """delegation.principal_address — the address that delegates authority."""

    agent: str
    """delegation.agent_address — the address authorised to act."""

    scopes: tuple[str, ...]
    """Raw scope strings (e.g. ``("pledge:create(max_bond_sats=2000000)",)``).
    pledge-core / orangecheck.pledge scan for an entry whose product:verb
    equals ``pledge:create``."""

    expires_at: str
    """delegation.expires_at, ISO 8601 UTC."""


# Caller-supplied lookup. May be sync OR async; mirror the AttestationLookup
# pattern in bond.py — verify_pledge accepts a pre-resolved result and the
# adapter does the I/O. (The TS SDK uses Promise<X | null>; Python keeps
# both sync and async tolerated to fit the consumer's runtime.)
DelegationLookup = Callable[
    [str, str], Union[Optional[DelegationLookupResult], Awaitable[Optional[DelegationLookupResult]]]
]


# ─── Scope parsing + matching ─────────────────────────────────────────────


_PLEDGE_CREATE_RE = re.compile(r"^pledge:create\(([^)]*)\)$")


def parse_pledge_create_scope(scope: str) -> Optional[dict[str, str]]:
    """Parse a single scope string. Returns the constraint map iff the
    product:verb is ``pledge:create``; ``None`` for any other scope (caller
    skips those). Tolerates whitespace inside parens; rejects malformed
    syntax by returning ``None`` (the scope is treated as non-matching
    rather than raising — matches OC Agent's permissive scope mode)."""
    trimmed = scope.strip()
    if trimmed == "pledge:create":
        return {}
    m = _PLEDGE_CREATE_RE.fullmatch(trimmed)
    if not m:
        return None
    inside = m.group(1).strip()
    if inside == "":
        return {}
    out: dict[str, str] = {}
    for pair in inside.split(","):
        eq = pair.find("=")
        if eq == -1:
            return None
        key = pair[:eq].strip()
        val = pair[eq + 1 :].strip()
        if not key:
            return None
        out[key] = val
    return out


@dataclass(frozen=True)
class ScopeCheckOk:
    matched_scope: str
    ok: Literal[True] = True


@dataclass(frozen=True)
class ScopeCheckErr:
    code: Literal["E_DELEGATION_SCOPE_VIOLATED", "E_DELEGATION_NOT_FOUND"]
    reason: str
    ok: Literal[False] = False


ScopeCheckResult = Union[ScopeCheckOk, ScopeCheckErr]


def check_pledge_create_scope(
    pledge: dict[str, Any],
    delegation: DelegationLookupResult,
) -> ScopeCheckResult:
    """Find the first ``pledge:create(...)`` scope in the delegation and
    verify the pledge satisfies all its constraints. SPEC §7.3.

    Returns ``ScopeCheckOk`` with the matched raw scope string, or
    ``ScopeCheckErr`` with ``E_DELEGATION_SCOPE_VIOLATED`` naming the
    failed constraint. ``pledge`` is the wire-form pledge envelope dict
    (kind='pledge', id, swearer, bond, resolution, counterparty, etc).
    """
    last_fail = ""
    for raw in delegation.scopes:
        parsed = parse_pledge_create_scope(raw)
        if parsed is None:
            continue
        violation = _pledge_fails_constraint(pledge, parsed)
        if violation is None:
            return ScopeCheckOk(matched_scope=raw)
        last_fail = violation
    if last_fail:
        return ScopeCheckErr(code="E_DELEGATION_SCOPE_VIOLATED", reason=last_fail)
    return ScopeCheckErr(
        code="E_DELEGATION_SCOPE_VIOLATED",
        reason="delegation does not authorize pledge:create",
    )


def _pledge_fails_constraint(
    pledge: dict[str, Any], constraints: dict[str, str]
) -> Optional[str]:
    """Returns ``None`` if the pledge satisfies every constraint; otherwise
    a human-readable reason naming the first failed constraint."""
    if "max_bond_sats" in constraints:
        try:
            max_sats = int(constraints["max_bond_sats"])
        except ValueError:
            return f'delegation max_bond_sats="{constraints["max_bond_sats"]}" is not a valid integer'
        bond = pledge.get("bond") or {}
        min_sats = int(bond.get("min_sats", 0))
        if min_sats > max_sats:
            return (
                f"pledge.bond.min_sats ({min_sats}) exceeds delegation's "
                f"max_bond_sats ({max_sats})"
            )

    if "mechanism" in constraints:
        resolution = pledge.get("resolution") or {}
        mech = resolution.get("mechanism")
        if mech != constraints["mechanism"]:
            return (
                f'pledge.resolution.mechanism="{mech}" does not match '
                f'delegation\'s mechanism="{constraints["mechanism"]}"'
            )

    if "counterparty" in constraints:
        want = constraints["counterparty"]
        cp = pledge.get("counterparty")
        if cp != want:
            cp_repr = "null" if cp is None else f'"{cp}"'
            return (
                f"pledge.counterparty={cp_repr} does not match delegation's "
                f'counterparty="{want}"'
            )

    return None


def iso_utc_greater_than(a: str, b: str) -> bool:
    """True iff strict ISO 8601 UTC ``a`` is strictly later than ``b``.
    Lexicographic compare works because the format is fixed-width
    YYYY-MM-DDTHH:MM:SSZ (SPEC §0)."""
    return a > b


# ─── Re-export for the verify_pledge integration ──────────────────────────
#
# verify_pledge in envelopes.py imports check_pledge_create_scope and
# iso_utc_greater_than to run §7.3 steps 1–5 when via_delegation is set
# AND a delegation_lookup callable is supplied via VerifyPledgeInput.
# Suppress the "unused" diagnostic — these are public-API exports.

__all__ = [
    "DelegationLookup",
    "DelegationLookupResult",
    "ScopeCheckOk",
    "ScopeCheckErr",
    "ScopeCheckResult",
    "parse_pledge_create_scope",
    "check_pledge_create_scope",
    "iso_utc_greater_than",
]


# Imported by envelopes.py via `from .delegation import ...` — silence
# the linter's "unused" warning by referencing the symbols here.
_ = (PledgeError, PledgeErrorCode)
