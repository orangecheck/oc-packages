"""
Canonical messages, ids, validators, and RFC 8785 envelope canonicalization
for OC Pledge v0.1.

Mirrors ``@orangecheck/pledge-core``'s canonical.ts function-for-function so
that both SDKs produce byte-identical output for the same canonical inputs
(SPEC §11.8). The cross-impl conformance harness in
``tests/pledge/test_vectors.py`` enforces this against every committed
vector in ``oc-pledge-protocol/test-vectors/``.
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
from dataclasses import dataclass
from typing import Any, Final, Literal, Optional, Union

from .._text import JS_WHITESPACE

ENVELOPE_VERSION: Final[int] = 1

# ─── Domain separators (SPEC §3.1, §4.1, §5.1) ────────────────────────────

PLEDGE_DOMAIN: Final[str] = "oc-pledge/v1"
OUTCOME_DOMAIN: Final[str] = "oc-pledge-outcome/v1"
ABANDONMENT_DOMAIN: Final[str] = "oc-pledge-abandonment/v1"

# ─── Type unions ──────────────────────────────────────────────────────────

ResolutionMechanism = Literal[
    "chain_state",
    "counterparty_signs",
    "nostr_event_exists",
    "stamp_published",
    "http_get_hash",
    "dns_record",
    "vote_resolves",
]

RESOLUTION_MECHANISMS: Final[tuple[ResolutionMechanism, ...]] = (
    "chain_state",
    "counterparty_signs",
    "nostr_event_exists",
    "stamp_published",
    "http_get_hash",
    "dns_record",
    "vote_resolves",
)

DisputeMechanism = Literal["vote_resolves", "named_oracle"]

OutcomeKind = Literal["kept", "broken", "expired_unresolved", "disputed"]

# ─── Pledge canonical input ───────────────────────────────────────────────


@dataclass(frozen=True)
class PledgeResolution:
    mechanism: ResolutionMechanism
    query: str


@dataclass(frozen=True)
class ResolvesAtTime:
    """resolves_at: { time: ISO 8601 UTC }"""

    time: str


@dataclass(frozen=True)
class ResolvesAtBlock:
    """resolves_at: { block: int }"""

    block: int


PledgeResolvesAt = Union[ResolvesAtTime, ResolvesAtBlock]


@dataclass(frozen=True)
class PledgeBond:
    attestation_id: str
    min_sats: int
    min_days: int


@dataclass(frozen=True)
class PledgeDispute:
    mechanism: Optional[DisputeMechanism]
    params: Optional[str]


@dataclass(frozen=True)
class PledgeCanonicalInput:
    swearer: str
    proposition: str
    resolution: PledgeResolution
    resolves_at: PledgeResolvesAt
    expires_at: str
    bond: PledgeBond
    counterparty: Optional[str]
    dispute: PledgeDispute
    remediation: Literal["breach_recorded"]
    sworn_at: str
    nonce: str


# ─── Outcome canonical input ──────────────────────────────────────────────


@dataclass(frozen=True)
class OutcomeEvidence:
    mechanism: ResolutionMechanism
    result: str
    witness: str


@dataclass(frozen=True)
class OutcomeCanonicalInput:
    pledge_id: str
    outcome: OutcomeKind
    resolved_at: str
    resolved_by: str
    evidence: OutcomeEvidence
    dispute_window_ends_at: str


# ─── Abandonment canonical input ──────────────────────────────────────────


@dataclass(frozen=True)
class AbandonmentCanonicalInput:
    pledge_id: str
    abandoned_at: str
    reason: str


# ─── Pledge canonical message (SPEC §3.1) ─────────────────────────────────


def canonical_pledge_message(input: PledgeCanonicalInput) -> str:
    """
    Build the exact byte sequence the swearer's BIP-322 signature commits
    to. LF-separated, no trailing LF after the ``nonce`` line. Sub-blocks
    (``resolution:``, ``resolves_at:``, ``bond:``, ``dispute:``) introduce
    a label-only line followed by 2-space-indented sub-fields. The literal
    token ``null`` is used for null counterparty / dispute fields (NOT a
    quoted string).
    """
    lines: list[str] = [PLEDGE_DOMAIN]
    lines.append(f"swearer: {input.swearer}")
    lines.append(f"proposition: {input.proposition}")
    lines.append("resolution:")
    lines.append(f"  mechanism: {input.resolution.mechanism}")
    lines.append(f"  query: {input.resolution.query}")
    lines.append("resolves_at:")
    if isinstance(input.resolves_at, ResolvesAtTime):
        lines.append(f"  time: {input.resolves_at.time}")
    else:
        lines.append(f"  block: {input.resolves_at.block}")
    lines.append(f"expires_at: {input.expires_at}")
    lines.append("bond:")
    lines.append(f"  attestation_id: {input.bond.attestation_id}")
    lines.append(f"  min_sats: {input.bond.min_sats}")
    lines.append(f"  min_days: {input.bond.min_days}")
    cp = "null" if input.counterparty is None else input.counterparty
    lines.append(f"counterparty: {cp}")
    lines.append("dispute:")
    dm = "null" if input.dispute.mechanism is None else input.dispute.mechanism
    lines.append(f"  mechanism: {dm}")
    dp = "null" if input.dispute.params is None else input.dispute.params
    lines.append(f"  params: {dp}")
    lines.append(f"remediation: {input.remediation}")
    lines.append(f"sworn_at: {input.sworn_at}")
    lines.append(f"nonce: {input.nonce}")
    return "\n".join(lines)


def utf8_bytes(text: str) -> bytes:
    """UTF-8 of ``text``, each lone surrogate as U+FFFD, as the WHATWG encoder
    (and so pledge-core) writes it (SPEC §0). JSON can carry one; UTF-8 cannot."""
    return _LONE_SURROGATE.sub("\ufffd", text).encode("utf-8")


_LONE_SURROGATE = re.compile("[\ud800-\udfff]")


def canonical_pledge_message_bytes(input: PledgeCanonicalInput) -> bytes:
    return utf8_bytes(canonical_pledge_message(input))


def compute_pledge_id(input: PledgeCanonicalInput) -> str:
    """sha256 of canonical-message bytes, as 64 lowercase hex chars."""
    return hashlib.sha256(canonical_pledge_message_bytes(input)).hexdigest()


# ─── Outcome canonical message (SPEC §4.1) ────────────────────────────────


def canonical_outcome_message(input: OutcomeCanonicalInput) -> str:
    lines = [OUTCOME_DOMAIN]
    lines.append(f"pledge_id: {input.pledge_id}")
    lines.append(f"outcome: {input.outcome}")
    lines.append(f"resolved_at: {input.resolved_at}")
    lines.append(f"resolved_by: {input.resolved_by}")
    lines.append("evidence:")
    lines.append(f"  mechanism: {input.evidence.mechanism}")
    lines.append(f"  result: {input.evidence.result}")
    lines.append(f"  witness: {input.evidence.witness}")
    lines.append(f"dispute_window_ends_at: {input.dispute_window_ends_at}")
    return "\n".join(lines)


def canonical_outcome_message_bytes(input: OutcomeCanonicalInput) -> bytes:
    return utf8_bytes(canonical_outcome_message(input))


def compute_outcome_id(input: OutcomeCanonicalInput) -> str:
    return hashlib.sha256(canonical_outcome_message_bytes(input)).hexdigest()


# ─── Abandonment canonical message (SPEC §5.1) ────────────────────────────


def canonical_abandonment_message(input: AbandonmentCanonicalInput) -> str:
    return "\n".join([
        ABANDONMENT_DOMAIN,
        f"pledge_id: {input.pledge_id}",
        f"abandoned_at: {input.abandoned_at}",
        f"reason: {input.reason}",
    ])


def canonical_abandonment_message_bytes(input: AbandonmentCanonicalInput) -> bytes:
    return utf8_bytes(canonical_abandonment_message(input))


def compute_abandonment_id(input: AbandonmentCanonicalInput) -> str:
    return hashlib.sha256(canonical_abandonment_message_bytes(input)).hexdigest()


# ─── Validators (SPEC §3.6, §4.2 table, §5.3 table) ───────────────────────

# SPEC §0: ISO 8601 UTC means YYYY-MM-DDTHH:MM:SSZ — no fractional seconds,
# no offsets other than the literal capital-Z suffix. Stricter than the
# OC Attest ISO regex.
_ISO_UTC_STRICT = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")
_HEX_64 = re.compile(r"^[0-9a-f]{64}$")
_HEX_32 = re.compile(r"^[0-9a-f]{32}$")
# JavaScript's whitespace and the C0 controls, as pledge-core's /[\s\x00-\x1f]/ reads them.
_SPACE_OR_CONTROL = re.compile(f"[{JS_WHITESPACE}\\x00-\\x1f]")


@dataclass(frozen=True)
class ValidateOk:
    ok: Literal[True] = True


@dataclass(frozen=True)
class ValidateErr:
    reason: str
    ok: Literal[False] = False


ValidateResult = Union[ValidateOk, ValidateErr]


def _r(reason: str) -> ValidateErr:
    return ValidateErr(reason=reason)


def validate_pledge_input(input: PledgeCanonicalInput) -> ValidateResult:
    if not input.swearer or _SPACE_OR_CONTROL.search(input.swearer):
        return _r("swearer must be non-empty with no whitespace or control chars")
    if not input.proposition or re.search(r"[\n\r]", input.proposition):
        return _r("proposition must be non-empty and a single line (no LF or CR)")
    if len(utf8_bytes(input.proposition)) > 512:
        return _r("proposition exceeds 512 UTF-8 bytes")
    if input.resolution.mechanism not in RESOLUTION_MECHANISMS:
        return _r(
            f'resolution.mechanism "{input.resolution.mechanism}" is not in the SPEC §3.4 set'
        )
    if not input.resolution.query or re.search(r"[\n\r]", input.resolution.query):
        return _r("resolution.query must be non-empty and a single line")
    if len(utf8_bytes(input.resolution.query)) > 1024:
        return _r("resolution.query exceeds 1024 UTF-8 bytes")
    if isinstance(input.resolves_at, ResolvesAtTime):
        if not _ISO_UTC_STRICT.fullmatch(input.resolves_at.time):
            return _r(
                "resolves_at.time must be ISO 8601 UTC ending in Z (no fractional seconds)"
            )
    elif isinstance(input.resolves_at, ResolvesAtBlock):
        if not _is_count(input.resolves_at.block):
            return _r("resolves_at.block must be a non-negative integer")
    else:
        return _r("resolves_at must contain exactly one of {time} or {block}")
    if not _ISO_UTC_STRICT.fullmatch(input.expires_at):
        return _r("expires_at must be ISO 8601 UTC ending in Z (no fractional seconds)")
    if not _HEX_64.fullmatch(input.bond.attestation_id):
        return _r("bond.attestation_id must be 64 lowercase hex chars")
    if not _is_count(input.bond.min_sats):
        return _r("bond.min_sats must be a non-negative integer")
    if not _is_count(input.bond.min_days):
        return _r("bond.min_days must be a non-negative integer")
    if input.counterparty is not None and _SPACE_OR_CONTROL.search(input.counterparty):
        return _r("counterparty must be a Bitcoin address or null")
    # The canonical message writes null as "null", so that string signs null's bytes (SPEC §3.6).
    if input.counterparty == "null":
        return _r('counterparty must not be the string "null": it signs the same bytes as null')
    if input.resolution.mechanism == "counterparty_signs" and input.counterparty is None:
        return _r("counterparty MUST be non-null when resolution.mechanism == counterparty_signs")
    if input.dispute.mechanism is not None and input.dispute.mechanism not in (
        "vote_resolves",
        "named_oracle",
    ):
        return _r('dispute.mechanism must be null, "vote_resolves", or "named_oracle"')
    if input.dispute.params is not None and re.search(r"[\n\r]", input.dispute.params):
        return _r("dispute.params must be a single line or null")
    if input.dispute.params == "null":
        return _r('dispute.params must not be the string "null": it signs the same bytes as null')
    if input.remediation != "breach_recorded":
        return _r('remediation must equal "breach_recorded" in v0.1')
    if not _ISO_UTC_STRICT.fullmatch(input.sworn_at):
        return _r("sworn_at must be ISO 8601 UTC ending in Z (no fractional seconds)")
    if len(input.nonce) == 0:
        return _r("nonce MUST be non-empty (E_PLEDGE_MALFORMED per SPEC §3.1)")
    if not _HEX_32.fullmatch(input.nonce):
        return _r("nonce must be 32 lowercase hex characters")
    return ValidateOk()


def validate_outcome_input(input: OutcomeCanonicalInput) -> ValidateResult:
    """What a signer may write in an outcome: the reader's rules, and
    one-line evidence (SPEC §4.1)."""
    read = read_outcome_input(input)
    if not read.ok:
        return read
    if not _one_line(input.evidence.result):
        return _r("evidence.result must be a non-empty single line")
    if not _one_line(input.evidence.witness):
        return _r("evidence.witness must be a non-empty single line")
    return ValidateOk()


def read_outcome_input(input: OutcomeCanonicalInput) -> ValidateResult:
    """What a verifier refuses in an outcome (SPEC §4.1, §11.13). Evidence
    grants nothing, so its length and its line breaks are not refused, with one
    exception: a line feed in ``result`` would let another envelope give the
    same bytes (result "r\n  witness: a" with witness "b" is result "r" with
    witness "a\n  witness: b"). Every field after ``witness`` is strict, so it
    may hold one."""
    if not _is_hex64(input.pledge_id):
        return _r("pledge_id must be 64 lowercase hex chars")
    if input.outcome not in ("kept", "broken", "expired_unresolved", "disputed"):
        return _r("outcome must be one of: kept, broken, expired_unresolved, disputed")
    if not _is_iso(input.resolved_at):
        return _r("resolved_at must be ISO 8601 UTC ending in Z")
    if input.resolved_by != "deterministic" and (
        not isinstance(input.resolved_by, str)
        or not input.resolved_by
        or _SPACE_OR_CONTROL.search(input.resolved_by)
    ):
        return _r('resolved_by must be "deterministic" or a Bitcoin address')
    if input.evidence.mechanism not in RESOLUTION_MECHANISMS:
        return _r(
            f'evidence.mechanism "{input.evidence.mechanism}" is not in the SPEC §3.4 set'
        )
    if not isinstance(input.evidence.result, str) or "\n" in input.evidence.result:
        return _r("evidence.result must be a string with no line feed")
    if not isinstance(input.evidence.witness, str):
        return _r("evidence.witness must be a string")
    if not _is_iso(input.dispute_window_ends_at):
        return _r("dispute_window_ends_at must be ISO 8601 UTC ending in Z")
    return ValidateOk()


def validate_abandonment_input(input: AbandonmentCanonicalInput) -> ValidateResult:
    """What a signer may write in an abandonment: the reader's rules, and a
    reason on one non-empty line of at most 280 UTF-8 bytes with no lone
    surrogate (SPEC §0, §5.1)."""
    read = read_abandonment_input(input)
    if not read.ok:
        return read
    if not _one_line(input.reason):
        return _r("reason must be a non-empty single line")
    if _LONE_SURROGATE.search(input.reason):
        return _r("reason holds a lone surrogate")
    if len(utf8_bytes(input.reason)) > 280:
        return _r("reason exceeds 280 UTF-8 bytes")
    return ValidateOk()


def read_abandonment_input(input: AbandonmentCanonicalInput) -> ValidateResult:
    """What a verifier refuses in an abandonment (SPEC §5.1, §11.13). The
    reason grants nothing and is the last line, after fields that are all
    strict, so a line break in it cannot make another abandonment's bytes:
    only a reason that is not a string is refused."""
    if not _is_hex64(input.pledge_id):
        return _r("pledge_id must be 64 lowercase hex chars")
    if not _is_iso(input.abandoned_at):
        return _r("abandoned_at must be ISO 8601 UTC ending in Z")
    if not isinstance(input.reason, str):
        return _r("reason must be a string")
    return ValidateOk()


def _one_line(v: str) -> bool:
    """What a signer writes in a free-text field: one non-empty line, no LF or CR."""
    return bool(v) and not re.search(r"[\n\r]", v)


def _is_count(v: Any) -> bool:
    """A non-negative integer, as Number.isInteger reads one: a bool is not one."""
    return isinstance(v, int) and not isinstance(v, bool) and v >= 0


def _json_int(v: Any) -> Any:
    """An integral JSON number as an int (JavaScript has one number type, so 1000.0
    is 1000 there). Anything else is returned as it came, for the validator to refuse:
    ``int()`` would read "5", " 5" and Unicode digits as numbers."""
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def _is_iso(v: Any) -> bool:
    return isinstance(v, str) and _ISO_UTC_STRICT.fullmatch(v) is not None


def _is_hex64(v: Any) -> bool:
    return isinstance(v, str) and _HEX_64.fullmatch(v) is not None


# ─── Dict adapters — JSON / test-vector loading ───────────────────────────


def pledge_input_from_dict(d: dict[str, Any]) -> PledgeCanonicalInput:
    """Build a PledgeCanonicalInput from a JSON-shaped dict (e.g. a vector's
    ``inputs`` block). Dispatches the resolves_at sub-shape on whether
    ``time`` or ``block`` is present."""
    rd = d["resolves_at"]
    resolves_at: PledgeResolvesAt = (
        ResolvesAtTime(time=rd["time"]) if "time" in rd else ResolvesAtBlock(block=_json_int(rd["block"]))
    )
    bond_d = d["bond"]
    dispute_d = d["dispute"]
    return PledgeCanonicalInput(
        swearer=d["swearer"],
        proposition=d["proposition"],
        resolution=PledgeResolution(
            mechanism=d["resolution"]["mechanism"],
            query=d["resolution"]["query"],
        ),
        resolves_at=resolves_at,
        expires_at=d["expires_at"],
        bond=PledgeBond(
            attestation_id=bond_d["attestation_id"],
            min_sats=_json_int(bond_d["min_sats"]),
            min_days=_json_int(bond_d["min_days"]),
        ),
        counterparty=d.get("counterparty"),
        dispute=PledgeDispute(
            mechanism=dispute_d.get("mechanism"),
            params=dispute_d.get("params"),
        ),
        remediation="breach_recorded",
        sworn_at=d["sworn_at"],
        nonce=d["nonce"],
    )


def outcome_input_from_dict(d: dict[str, Any]) -> OutcomeCanonicalInput:
    ev = d["evidence"]
    return OutcomeCanonicalInput(
        pledge_id=d["pledge_id"],
        outcome=d["outcome"],
        resolved_at=d["resolved_at"],
        resolved_by=d["resolved_by"],
        evidence=OutcomeEvidence(
            mechanism=ev["mechanism"],
            result=ev["result"],
            witness=ev["witness"],
        ),
        dispute_window_ends_at=d["dispute_window_ends_at"],
    )


def abandonment_input_from_dict(d: dict[str, Any]) -> AbandonmentCanonicalInput:
    return AbandonmentCanonicalInput(
        pledge_id=d["pledge_id"],
        abandoned_at=d["abandoned_at"],
        reason=d["reason"],
    )


# ─── RFC 8785 envelope canonicalization (SPEC §6) ─────────────────────────
#
# Same algorithm as the TS SDK's canonicalize: keys sorted, no insignificant
# whitespace, integers serialized without exponents, control chars
# \uXXXX-escaped, ``None`` keys dropped (used for optional fields).


def canonicalize_envelope(env: Any) -> str:
    """Render ``env`` as a canonical JSON string per RFC 8785."""
    return _encode(env)


def _encode(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int) and not isinstance(v, bool):
        return _encode_number(v)
    if isinstance(v, float):
        return _encode_number(v)
    if isinstance(v, str):
        return _encode_string(v)
    if isinstance(v, list):
        return "[" + ",".join(_encode(x) for x in v) + "]"
    if isinstance(v, dict):
        keys = sorted(v.keys())
        parts: list[str] = []
        for k in keys:
            inner = v[k]
            if inner is None and k not in _KEEP_NULL_KEYS:
                # JSON-side null keys we DO want to keep (e.g. dispute.mechanism)
                # are listed in _KEEP_NULL_KEYS; everything else with None is
                # treated as "omit", mirroring the TS SDK's `undefined` drop.
                # Adjust the set as the spec evolves.
                continue
            parts.append(_encode_string(str(k)) + ":" + _encode(inner))
        return "{" + ",".join(parts) + "}"
    raise TypeError(f"cannot canonicalize value of type {type(v).__name__}")


# Keys whose null values are semantically meaningful and MUST appear in the
# canonical envelope JSON (e.g. ``dispute.mechanism: null``,
# ``counterparty: null``, ``sig: null`` for deterministic outcomes).
_KEEP_NULL_KEYS: set[str] = {
    "counterparty",
    "mechanism",
    "params",
    "sig",
}


def _encode_number(n: Any) -> str:
    if isinstance(n, bool):
        # Bools are ints in Python — caught at _encode level, but defensive.
        return "true" if n else "false"
    if isinstance(n, int):
        return str(n)
    # Float — only used for non-integer numbers; defer to JSON's serialization
    # which avoids exponents for typical ranges. The pledge spec doesn't use
    # floats in any canonical-message field, but the envelope canonicalizer
    # is shared with potential future surfaces.
    if n != n or n in (float("inf"), float("-inf")):  # NaN / infinity
        raise ValueError("non-finite number not JSON-canonicalizable")
    return json.dumps(n)


_ESCAPE_TABLE: dict[str, str] = {
    "\\": "\\\\",
    '"': '\\"',
    "\b": "\\b",
    "\f": "\\f",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
}


def _encode_string(s: str) -> str:
    out = ['"']
    for ch in s:
        code = ord(ch)
        if ch in _ESCAPE_TABLE:
            out.append(_ESCAPE_TABLE[ch])
        elif code < 0x20:
            out.append(f"\\u{code:04x}")
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


# ─── Helpers ──────────────────────────────────────────────────────────────


def generate_nonce() -> str:
    """16 random bytes → 32 lowercase hex chars."""
    return secrets.token_bytes(16).hex()
