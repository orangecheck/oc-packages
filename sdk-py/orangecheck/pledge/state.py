"""
Pure-function state machine — SPEC §4.4.

Mirrors the TS SDK's classifyState in src/state.ts. Same transition rules:

    abandonment present      → broken (always; no honorable exit, §5.4)
    contradictory outcomes   → disputed (§4.5)
    outcome present          → outcome.outcome
    now >= expires_at        → expired_unresolved
    now >= resolves_at       → resolvable
    else                     → pending
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal, Optional

PledgeState = Literal[
    "pending",
    "resolvable",
    "kept",
    "broken",
    "disputed",
    "expired_unresolved",
]

_ISO_UTC_STRICT = re.compile(r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$")


@dataclass(frozen=True)
class ChainState:
    tip_height: int
    tip_time: str
    block_times: Optional[dict[int, str]] = None


def classify_state(
    *,
    pledge: dict[str, Any],
    outcome: Optional[dict[str, Any]],
    abandonment: Optional[dict[str, Any]],
    now: str,
    chain: Optional[ChainState] = None,
    contradictory_outcomes: Optional[list[dict[str, Any]]] = None,
) -> PledgeState:
    """Classify the state of a pledge given (pledge envelope, optional outcome
    envelope, optional abandonment envelope, current time, optional chain
    state for block-typed resolves_at, optional contradictory outcomes).

    All envelope arguments are JSON-shaped dicts (matching the wire form).
    """
    now_ms = _parse_utc(now)

    # Abandonment trumps everything — SPEC §5.4 / WHY §H8.
    if abandonment is not None:
        return "broken"

    # Contradictory outcome envelopes from authorized resolvers → disputed.
    if outcome is not None and contradictory_outcomes:
        for other in contradictory_outcomes:
            if (
                other.get("pledge_id") == outcome.get("pledge_id")
                and other.get("outcome") != outcome.get("outcome")
            ):
                return "disputed"

    if outcome is not None:
        return outcome.get("outcome")  # type: ignore[return-value]

    expires_at_ms = _parse_utc(pledge["expires_at"])
    if now_ms >= expires_at_ms:
        return "expired_unresolved"

    resolves_at_ms = _normalize_resolves_at(pledge, chain)
    if resolves_at_ms is not None and now_ms >= resolves_at_ms:
        return "resolvable"

    return "pending"


def _normalize_resolves_at(
    pledge: dict[str, Any], chain: Optional[ChainState]
) -> Optional[int]:
    r = pledge["resolves_at"]
    if "time" in r:
        return _parse_utc(r["time"])
    if "block" in r:
        if chain is None:
            return None  # +infinity — pledge stays pending without chain context
        block = int(r["block"])
        if chain.block_times and block in chain.block_times:
            return _parse_utc(chain.block_times[block])
        if chain.tip_height >= block:
            # Block has been mined; conservative bound is tip_time.
            return _parse_utc(chain.tip_time)
        return None  # not yet mined
    return None


def _parse_utc(s: str) -> int:
    """Parse strict ISO 8601 UTC (YYYY-MM-DDTHH:MM:SSZ) into epoch ms.

    Mirrors the TS SDK's parseUtc — no fractional seconds, no offsets other
    than ``Z``. Avoids datetime / strptime to keep behaviour deterministic
    across CPython versions and locales."""
    m = _ISO_UTC_STRICT.fullmatch(s)
    if not m:
        raise ValueError(f"invalid ISO 8601 UTC string: {s!r}")
    y, mo, d, h, mi, se = (int(g) for g in m.groups())
    # epoch (1970-01-01) → ms via day-of-year arithmetic.
    days = _date_to_days(y, mo, d) - _date_to_days(1970, 1, 1)
    return ((days * 24 + h) * 3600 + mi * 60 + se) * 1000


def _date_to_days(year: int, month: int, day: int) -> int:
    """Convert (Y, M, D) to a serial day count using the Gregorian calendar."""
    # Standard civil-from-days algorithm rearranged to days-from-civil.
    if month <= 2:
        year -= 1
        month += 12
    era = year // 400 if year >= 0 else (year - 399) // 400
    yoe = year - era * 400
    doy = (153 * (month - 3) + 2) // 5 + day - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    return era * 146097 + doe - 719468


def outcomes_contradict(a: dict[str, Any], b: dict[str, Any]) -> bool:
    """True iff two outcome envelopes for the same pledge classify differently."""
    if a.get("pledge_id") != b.get("pledge_id"):
        return False
    return a.get("outcome") != b.get("outcome")
