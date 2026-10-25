"""
OC Agent §7.3 delegation checks for agent-delegated pledges.

Mirrors @orangecheck/pledge-core's src/delegation.ts: same scope grammar,
same constraint matching, held to the same vectors. The fetch +
verifyDelegation side is the caller's responsibility (typically delegated to
the OC Agent Python SDK or the hosted resolver); this module does the
pledge-specific scope matching against the resolved delegation result.

The pledge:create scope grammar (SPEC §7.3):

    pledge:create
    pledge:create(max_bond_sats<=<N>)
    pledge:create(mechanism=<m>)
    pledge:create(counterparty=<addr>)
    pledge:create(max_bond_sats<=<N>,mechanism=<m>)

Multiple constraints comma-separated; AND-joined. ``max_bond_sats=<N>`` is
read as the same ceiling. A key, operator or value this module does not
recognise fails the check.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Literal, Optional, Union

from .._text import JS_DOT, js_regex, js_strip
from .canonical import _is_count, _json_int
from .envelopes import PledgeError, PledgeErrorCode

#: JavaScript's Number.MAX_SAFE_INTEGER: pledge-core refuses a larger ceiling.
_MAX_SAFE_INTEGER = 2**53 - 1


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


_PLEDGE_CREATE_KEYS = frozenset({"max_bond_sats", "mechanism", "counterparty"})
_PLEDGE_CREATE_RE = re.compile(r"^pledge:create\(([^)]*)\)$")
_CONSTRAINT_RE = js_regex(r"^([a-z][a-z0-9_]*)\s*(<=|=)\s*(" + JS_DOT + r"+)$")


def parse_pledge_create_scope(scope: str) -> Optional[dict[str, str]]:
    """Parse a single scope string. Returns the constraint map iff the
    product:verb is ``pledge:create``; ``None`` for any other scope (caller
    skips those) and for a malformed one, which is treated as non-matching
    rather than raising.

    ``max_bond_sats`` is a ceiling, written ``max_bond_sats<=N`` (OC Agent's
    range operator); ``max_bond_sats=N`` means the same. Every other key takes
    ``=`` only. A duplicate key makes the scope malformed."""
    trimmed = js_strip(scope)
    if trimmed == "pledge:create":
        return {}
    m = _PLEDGE_CREATE_RE.fullmatch(trimmed)
    if not m:
        return None
    inside = js_strip(m.group(1))
    if inside == "":
        return {}
    out: dict[str, str] = {}
    for pair in inside.split(","):
        c = _CONSTRAINT_RE.fullmatch(js_strip(pair))
        if not c:
            return None  # malformed or an unsupported operator
        key, op, raw = c.group(1), c.group(2), c.group(3)
        if op == "<=" and key != "max_bond_sats":
            return None
        if key in out:
            return None
        out[key] = _unquote(js_strip(raw))
    return out


def _unquote(v: str) -> str:
    return v[1:-1] if len(v) >= 2 and v.startswith('"') and v.endswith('"') else v


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
    # A constraint this verifier does not understand cannot be shown to hold.
    for key in constraints:
        if key not in _PLEDGE_CREATE_KEYS:
            return f'delegation constraint "{key}" is not a pledge:create constraint'

    if "max_bond_sats" in constraints:
        raw = constraints["max_bond_sats"]
        # ASCII digits and a safe integer, as pledge-core reads it: int() would take " 5", "1_0" and Arabic-Indic digits,
        # and raises past CPython's digit limit, so at most 16 significant digits reach it.
        significant = raw.lstrip("0") or "0"
        if not re.fullmatch(r"[0-9]+", raw) or len(significant) > 16 or int(significant) > _MAX_SAFE_INTEGER:
            return f'delegation max_bond_sats="{raw[:32]}" is not a valid integer'
        max_sats = int(significant)
        min_sats = _json_int((pledge.get("bond") or {}).get("min_sats"))
        if not _is_count(min_sats):
            return "pledge.bond.min_sats is not a non-negative integer"
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
        # REGISTRY.md: `counterparty=null` restricts the agent to pledges with none.
        want = None if constraints["counterparty"] == "null" else constraints["counterparty"]
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
