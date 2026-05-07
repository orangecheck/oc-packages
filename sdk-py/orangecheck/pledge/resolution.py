"""
Resolution-grammar validation — SPEC §3.4.

The seven mechanisms each have a fixed-shape query string. This module
validates that a query conforms to its mechanism's grammar at the regex
level. Full evaluation against public state (chain RPC, HTTP, DNS-over-
HTTPS, Nostr, Vote tally) is out of scope — the SDK stays pure.

``self_proof`` is explicitly refused (§3.4.8). Mirrors the TS SDK's
src/resolution.ts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal, Union

ResolutionMechanism = Literal[
    "chain_state",
    "counterparty_signs",
    "nostr_event_exists",
    "stamp_published",
    "http_get_hash",
    "dns_record",
    "vote_resolves",
]

_ALLOWED: tuple[ResolutionMechanism, ...] = (
    "chain_state",
    "counterparty_signs",
    "nostr_event_exists",
    "stamp_published",
    "http_get_hash",
    "dns_record",
    "vote_resolves",
)
_REFUSED = ("self_proof",)


_CHAIN_STATE_ATOM = re.compile(
    "|".join(
        [
            r"block\(\d+\)\.hash\.startsWith\([0-9a-fA-F]+\)",
            r"block\(\d+\)\.exists",
            r"tx\([0-9a-fA-F]{64}\)\.confirmed",
            r"tx\([0-9a-fA-F]{64}\)\.confirmations\s*>=\s*\d+",
            r"address\([^)]+\)\.balance\s*(?:>=|<=|<|>|==)\s*\d+(?:\s+AT\s+block\(\d+\))?",
            r"address\([^)]+\)\.utxo_count\s*(?:>=|<=|<|>|==)\s*\d+",
        ]
    )
)
_CHAIN_STATE_ATOM_FULL = re.compile(rf"^(?:{_CHAIN_STATE_ATOM.pattern})$")

_COUNTERPARTY_SIGNS_RE = re.compile(
    r"^counterparty\([^)]+\)\s+signs\s+outcome\s+over\s+pledge_id$"
)

_NOSTR_EVENT_EXISTS_RE = re.compile(
    r"^kind=\d+\s+author=\S+(?:\s+tag\([^)]+\)=\S+)?\s+created_at_before=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$"
)

_STAMP_PUBLISHED_RE = re.compile(
    r"^stamp\(content_hash=sha256:[0-9a-f]{64},\s*signer=\S+\)$"
)

_HTTP_GET_HASH_RE = re.compile(r"^GET\s+https://\S+\s+body_sha256\s*==\s*[0-9a-f]{64}$")

_DNS_RECORD_RE = re.compile(r"^(?:A|AAAA|TXT|CAA|MX|CNAME)\s+\S+\s*==\s*\S.*$")

_VOTE_RESOLVES_RE = re.compile(
    r"^poll_id=[0-9a-f]{64}\s+option=\S+\s+threshold=(?:0(?:\.\d+)?|1(?:\.0+)?)$"
)


@dataclass(frozen=True)
class ResolutionOk:
    ok: Literal[True]
    mechanism: ResolutionMechanism


@dataclass(frozen=True)
class ResolutionErr:
    ok: Literal[False]
    code: Literal["E_RESOLUTION_UNKNOWN", "E_RESOLUTION_NONDETERMINISTIC"]
    reason: str


ResolutionValidateResult = Union[ResolutionOk, ResolutionErr]


def _non_det(reason: str) -> ResolutionErr:
    return ResolutionErr(ok=False, code="E_RESOLUTION_NONDETERMINISTIC", reason=reason)


def validate_resolution_query(mechanism: str, query: str) -> ResolutionValidateResult:
    """Validate ``(mechanism, query)`` against SPEC §3.4. Returns ok+mechanism
    for the seven legitimate mechanisms with conforming queries; an error
    otherwise. ``self_proof`` is explicitly refused per §3.4.8."""
    if mechanism in _REFUSED:
        return ResolutionErr(
            ok=False,
            code="E_RESOLUTION_NONDETERMINISTIC",
            reason=f'mechanism "{mechanism}" is explicitly refused (SPEC §3.4.8 / WHY §H3)',
        )
    if mechanism not in _ALLOWED:
        return ResolutionErr(
            ok=False,
            code="E_RESOLUTION_UNKNOWN",
            reason=f'mechanism "{mechanism}" is not in the SPEC §3.4 set',
        )

    if "\n" in query or "\r" in query:
        return _non_det("query must be a single line (no LF or CR)")
    if len(query.encode("utf-8")) > 1024:
        return _non_det("query exceeds 1024 UTF-8 bytes")

    m: ResolutionMechanism = mechanism  # narrowing after _ALLOWED check above

    if m == "chain_state":
        for part in re.split(r"\s+AND\s+", query):
            if not _CHAIN_STATE_ATOM_FULL.fullmatch(part.strip()):
                return _non_det(f'chain_state predicate not in §3.4.1 grammar: "{part}"')
        return ResolutionOk(ok=True, mechanism=m)
    if m == "counterparty_signs":
        return (
            ResolutionOk(ok=True, mechanism=m)
            if _COUNTERPARTY_SIGNS_RE.fullmatch(query)
            else _non_det("counterparty_signs query must match §3.4.2 canonical form")
        )
    if m == "nostr_event_exists":
        return (
            ResolutionOk(ok=True, mechanism=m)
            if _NOSTR_EVENT_EXISTS_RE.fullmatch(query)
            else _non_det("nostr_event_exists query not in §3.4.3 grammar")
        )
    if m == "stamp_published":
        return (
            ResolutionOk(ok=True, mechanism=m)
            if _STAMP_PUBLISHED_RE.fullmatch(query)
            else _non_det("stamp_published query not in §3.4.4 grammar")
        )
    if m == "http_get_hash":
        return (
            ResolutionOk(ok=True, mechanism=m)
            if _HTTP_GET_HASH_RE.fullmatch(query)
            else _non_det("http_get_hash query not in §3.4.5 grammar")
        )
    if m == "dns_record":
        return (
            ResolutionOk(ok=True, mechanism=m)
            if _DNS_RECORD_RE.fullmatch(query)
            else _non_det("dns_record query not in §3.4.6 grammar")
        )
    if m == "vote_resolves":
        return (
            ResolutionOk(ok=True, mechanism=m)
            if _VOTE_RESOLVES_RE.fullmatch(query)
            else _non_det("vote_resolves query not in §3.4.7 grammar")
        )
    # Unreachable — exhaustive over the Literal union.
    return _non_det(f"unhandled mechanism {m!r}")
