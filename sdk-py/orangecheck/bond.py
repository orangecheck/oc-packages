"""
Bonds (oc-attest-protocol BOND.md): one unspent coin backing one subject.
The coin stays in its holder's wallet; spending it ends the bond. An audience
sees floors and a keyed per-audience nullifier, never the coin.

The message, id, nullifier and floors are pure and need nothing installed.
``verify_bond_signature`` needs the ``[verify]`` extra for BIP-322. Checking
the coin itself (unspent, confirmed, at the address) is chain state: read it
from a node or an Esplora API you trust and compare it the way BOND.md §3.5
says.
"""

from __future__ import annotations

import hashlib
import hmac
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from .address import decode_address

HEADER = "orangecheck-bond"
ACK = "I back this subject with this coin. It stays in my wallet."
FIELDS = ("address", "outpoint", "subject", "nonce", "issued_at", "expires_at")

#: Value floors a bond claim reports, in sats (BOND.md §5).
BOND_SATS_FLOORS = (1_000, 10_000, 100_000, 1_000_000, 10_000_000)
#: Age floors a bond claim reports, in days of 144 blocks (BOND.md §5).
BOND_DAYS_FLOORS = (7, 30, 90, 365)
#: The longest signing window a verifier accepts by default, in seconds (BOND.md §2).
BOND_MAX_WINDOW_SECONDS = 3600

_OUTPOINT = re.compile(r"^[0-9a-f]{64}:(0|[1-9][0-9]{0,9})$")
_NONCE = re.compile(r"^[0-9a-f]{32}$")
_TIME = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
_SUBJECT = re.compile(r"^[\x21-\x7e]{1,256}$")

@dataclass(frozen=True)
class BondFields:
    address: str
    outpoint: str
    subject: str
    nonce: str
    issued_at: str
    expires_at: str


def _when(s: str) -> datetime:
    # strptime refuses times that roll over, such as T24:00:00Z or February 30.
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def _well_formed(f: BondFields) -> bool:
    return bool(
        decode_address(f.address)
        and _OUTPOINT.match(f.outpoint)
        and _SUBJECT.match(f.subject)
        and _NONCE.match(f.nonce)
        and _TIME.match(f.issued_at)
        and _TIME.match(f.expires_at)
        and _when(f.expires_at) > _when(f.issued_at)
    )


def build_bond_message(fields: BondFields) -> str:
    """The exact text the holder signs (BOND.md §2)."""
    if not _well_formed(fields):
        raise ValueError("bond fields are malformed")
    lines = [HEADER] + [f"{k}: {getattr(fields, k)}" for k in FIELDS] + [f"ack: {ACK}"]
    return "\n".join(lines) + "\n"


def parse_bond_message(message: str) -> Optional[BondFields]:
    """The fields of a well-formed bond message, or None. Strict: §2 or nothing."""
    if not message.endswith("\n") or "\r" in message:
        return None
    lines = message[:-1].split("\n")
    if len(lines) != len(FIELDS) + 2 or lines[0] != HEADER or lines[-1] != f"ack: {ACK}":
        return None
    values = {}
    for i, key in enumerate(FIELDS):
        prefix = f"{key}: "
        if not lines[i + 1].startswith(prefix):
            return None
        values[key] = lines[i + 1][len(prefix):]
    fields = BondFields(**values)
    try:
        return fields if _well_formed(fields) and build_bond_message(fields) == message else None
    except ValueError:
        return None


def bond_id(message: str) -> str:
    """SHA-256 of the message bytes, lowercase hex (BOND.md §2)."""
    return hashlib.sha256(message.encode("utf-8")).hexdigest()


def bond_nullifier(key: bytes, audience: str, outpoint: str) -> str:
    """
    The per-audience nullifier for a coin (BOND.md §6), keyed with a secret only
    the registry holds. Unkeyed, an audience could hash every unspent output and
    find the coin.
    """
    if len(key) < 32:
        raise ValueError("bond nullifier key must be at least 32 bytes")
    data = f"orangecheck-bond-nullifier\n{audience}\n{outpoint}".encode("utf-8")
    return hmac.new(key, data, hashlib.sha256).hexdigest()


def bond_floors(sats: int, age_blocks: int) -> dict[str, int]:
    """The largest floor each value meets, 0 when it meets none (BOND.md §5)."""
    days = age_blocks // 144
    return {
        "sats_floor": max((f for f in BOND_SATS_FLOORS if sats >= f), default=0),
        "days_floor": max((f for f in BOND_DAYS_FLOORS if days >= f), default=0),
    }


def verify_bond_signature(
    message: str,
    signature: str,
    *,
    subject: Optional[str] = None,
    now: Optional[datetime] = None,
    skew_seconds: int = 60,
    max_window_seconds: int = BOND_MAX_WINDOW_SECONDS,
) -> tuple[bool, str]:
    """
    Check a signed bond message: shape, subject, signing window, signature.
    Returns ``(True, bond_id)`` or ``(False, reason)`` with BOND.md's reason
    codes. Requires the ``[verify]`` extra for the signature.
    """
    from .verify_sig import verify_bip322_signature

    fields = parse_bond_message(message)
    if fields is None:
        return False, "bond_malformed"
    if subject is not None and fields.subject != subject:
        return False, "bond_subject_mismatch"
    window = (_when(fields.expires_at) - _when(fields.issued_at)).total_seconds()
    if window > max_window_seconds:
        return False, "bond_window_too_long"
    at = (now or datetime.now(timezone.utc)).timestamp()
    if _when(fields.issued_at).timestamp() - skew_seconds > at:
        return False, "bond_not_yet_valid"
    if _when(fields.expires_at).timestamp() + skew_seconds < at:
        return False, "bond_expired"
    if not verify_bip322_signature(fields.address, message, signature):
        return False, "sig_invalid"
    return True, bond_id(message)
