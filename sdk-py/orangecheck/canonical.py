"""
Canonical message construction for OCP v0.

Mirrors the TypeScript SDK's canonical.ts so Python consumers can
build, hash, and validate attestations offline — no round-trip to
ochk.io required.

The three load-bearing functions:

    build_canonical_message(address, identities, extensions, nonce, issued_at)
    attestation_id(message) -> str  # sha256 hex, 64 chars lowercase
    score_v0(sats_bonded, days_unspent) -> float

Plus format_identities() and the reject-at-the-boundary safety rules.

This module is cross-impl pinned by the conformance vectors at:
  github.com/orangecheck/oc-attest-protocol/tree/main/conformance/vectors
"""

from __future__ import annotations

import hashlib
import math
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Mapping, Sequence

# ─── Identity safety rules ─────────────────────────────────────────────────

# Protocol must start lowercase and contain only lowercase letters, digits,
# underscore, or hyphen. Same rule as the TS SDK's IDENTITY_PROTOCOL_RE.
_IDENTITY_PROTOCOL_RE = re.compile(r"^[a-z][a-z0-9_-]*$")

# Any of \r \n , would break the line-oriented canonical grammar or the
# comma-separated identities list. See the TS SDK's assertSafeIdentity for
# the load-bearing rationale — an attacker-controlled identifier containing
# \n could smuggle a forged `address:` line into the signed payload.
_IDENTITY_FORBIDDEN = re.compile(r"[\r\n,]")


@dataclass(frozen=True)
class IdentityBinding:
    """One identity binding attached to an attestation."""

    protocol: str
    identifier: str


def _assert_safe_identity(id: IdentityBinding) -> None:
    if not _IDENTITY_PROTOCOL_RE.fullmatch(id.protocol):
        raise ValueError(
            f"invalid identity protocol: {id.protocol!r} — must match ^[a-z][a-z0-9_-]*$"
        )
    if not id.identifier or _IDENTITY_FORBIDDEN.search(id.identifier):
        raise ValueError(
            f"invalid identity identifier: {id.identifier!r} — "
            "must be non-empty and contain no newlines or commas"
        )


def format_identities(identities: Sequence[IdentityBinding | Mapping[str, str]]) -> str:
    """
    Format identities as comma-separated ``protocol:identifier`` pairs, sorted
    lexicographically. Rejects unsafe characters at the boundary (see
    ``_assert_safe_identity``).

    Accepts either ``IdentityBinding`` instances or plain dicts with
    ``protocol`` / ``identifier`` keys (for JSON interop).
    """
    if not identities:
        return ""
    normalized: list[IdentityBinding] = []
    for item in identities:
        b = (
            item
            if isinstance(item, IdentityBinding)
            else IdentityBinding(protocol=item["protocol"], identifier=item["identifier"])
        )
        _assert_safe_identity(b)
        normalized.append(b)
    return ",".join(sorted(f"{b.protocol}:{b.identifier}" for b in normalized))


def parse_identities(identities_str: str) -> list[IdentityBinding]:
    """Reverse of ``format_identities``. Rejects the same unsafe shapes."""
    if not identities_str or not identities_str.strip():
        return []
    # A bare newline inside the identities field means either corruption or
    # an attempted line-smuggling attack — refuse either way.
    if _IDENTITY_FORBIDDEN.search(identities_str.replace(",", "")):
        raise ValueError("identities field contains forbidden characters (newline)")
    bindings: list[IdentityBinding] = []
    for chunk in identities_str.split(","):
        idx = chunk.find(":")
        if idx == -1:
            raise ValueError(f"invalid identity binding format: {chunk!r}")
        b = IdentityBinding(
            protocol=chunk[:idx].strip(),
            identifier=chunk[idx + 1 :].strip(),
        )
        if not b.protocol or not b.identifier:
            raise ValueError(f"invalid identity binding: {b.protocol!r}:{b.identifier!r}")
        _assert_safe_identity(b)
        bindings.append(b)
    return bindings


# ─── Nonce + timestamp helpers ─────────────────────────────────────────────


_NONCE_RE = re.compile(r"^[0-9a-f]{32}$")


def random_nonce() -> str:
    """16 bytes of secrets.token_bytes → 32 lowercase hex chars."""
    return secrets.token_bytes(16).hex()


def _now_rfc3339_utc() -> str:
    """RFC-3339 UTC with second precision (no fractional seconds)."""
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ─── Canonical message ─────────────────────────────────────────────────────


def build_canonical_message(
    *,
    address: str,
    identities: Sequence[IdentityBinding | Mapping[str, str]] = (),
    extensions: Mapping[str, str | int | None] | None = None,
    nonce: str | None = None,
    issued_at: str | None = None,
) -> str:
    """
    Build the canonical OCP v0 message for ``address``.

    Parameters
    ----------
    address:
        Bitcoin address the signer claims to control.
    identities:
        Sequence of ``IdentityBinding`` (or equivalent dicts). Output is
        sorted lexicographically regardless of input order.
    extensions:
        Optional key/value extensions. Empty-string and ``None`` values are
        dropped. Keys are lowercased and sorted lexicographically in the
        output. Non-string values are ``str()``-ified.
    nonce:
        Optional 32-lowercase-hex override. Tests only; production callers
        should let this default to a fresh cryptographic nonce.
    issued_at:
        Optional RFC-3339 UTC override.

    Returns
    -------
    The canonical message string, ending with a single ``\\n``.
    """
    final_nonce = nonce if nonce is not None else random_nonce()
    if not _NONCE_RE.fullmatch(final_nonce):
        raise ValueError(f"invalid nonce: {final_nonce!r} — must be 32 lowercase hex chars")
    final_issued_at = issued_at if issued_at is not None else _now_rfc3339_utc()

    identities_str = format_identities(identities)

    core = [
        "orangecheck",
        f"identities: {identities_str}",
        f"address: {address}",
        "purpose: portable reputation attestation (non-custodial)",
        f"nonce: {final_nonce}",
        f"issued_at: {final_issued_at}",
        "ack: I attest control of this address and bind it to my identities.",
    ]

    # Extensions: lowercase, drop empties, sort lex.
    norm_ext: dict[str, str] = {}
    for k, v in (extensions or {}).items():
        if v is None or v == "":
            continue
        norm_ext[k.lower()] = str(v)
    ext_lines = [f"{k}: {norm_ext[k]}" for k in sorted(norm_ext.keys())]

    return "\n".join(core + ext_lines) + "\n"


def attestation_id(message: str) -> str:
    """``sha256(message_utf8)`` → 64-char lowercase hex."""
    return hashlib.sha256(message.encode("utf-8")).hexdigest()


# ─── Reference scoring (SPEC §8.3) ─────────────────────────────────────────


def score_v0(sats_bonded: int, days_unspent: int) -> float:
    """
    Reference score algorithm::

        score_v0 = round( ln(1 + sats_bonded) * (1 + days_unspent / 30), 2 )

    Advisory — RPs should compare raw ``sats_bonded`` + ``days_unspent``
    against their own thresholds rather than trusting the score.
    """
    if sats_bonded < 0 or days_unspent < 0:
        raise ValueError("sats_bonded and days_unspent must be non-negative")
    raw = math.log(1 + sats_bonded) * (1 + days_unspent / 30)
    return round(raw, 2)
