"""
Pure-function state machine — SPEC §4.4.

Mirrors the TS SDK's classifyState in src/state.ts. Same transition rules:

    abandonment present      → broken (always; no honorable exit, §5.4)
    contradictory outcomes   → disputed (§4.5): the resolver's own contradiction
                               dated before the earliest settling outcome's
                               dispute_window_ends_at, or any swearer counter-claim
                               in force; with no dispute mechanism it times out to
                               expired_unresolved at expires_at
    outcome present          → the earliest settling outcome's outcome; a swearer
                               counter-claim alone settles nothing
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

_ISO_UTC_STRICT = re.compile(r"^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z$")


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
    ``outcome`` and ``contradictory_outcomes`` are outcomes from authorized
    resolvers, verified by the caller (verify_outcome), in any order: the
    earliest settling one in force classifies the pledge. The resolver's own
    contradiction counts only when dated before that outcome's
    ``dispute_window_ends_at``; a swearer counter-claim in force always counts
    (→ ``disputed``). With no ``dispute.mechanism``, such a dispute times out
    to ``expired_unresolved`` at ``expires_at``.
    """
    now_ms = _parse_utc(now)

    # Envelopes about another pledge say nothing about this one, and only the
    # swearer can abandon (SPEC §5.3). Signatures are the caller's job via
    # verify_abandonment()/verify_outcome() with the pledge supplied.
    pledge_id = pledge.get("id")
    swearer = (pledge.get("swearer") or {}).get("address")
    # An outcome dated after `now` describes a resolution that has not happened
    # yet, so it does not classify the pledge until then.
    # A signed outcome dated at or after expires_at comes too late (§3.4.2);
    # anyone can still compute a deterministic one after it.
    expires_at_ms = _parse_utc(pledge["expires_at"])

    def in_force(o: dict[str, Any]) -> bool:
        return (
            o.get("pledge_id") == pledge_id
            and not _dated_after(o.get("resolved_at"), now_ms)
            and (o.get("resolved_by") == "deterministic" or _dated_before(o.get("resolved_at"), expires_at_ms))
        )

    # Only the pledge's resolver settles it (§4.3): the counterparty under
    # counterparty_signs, else the deterministic computation. Under
    # counterparty_signs the swearer may counter-claim (§4.5): that contradicts
    # the counterparty's outcome but never settles the pledge alone.
    bilateral = (pledge.get("resolution") or {}).get("mechanism") == "counterparty_signs"
    counterparty = pledge.get("counterparty")

    def settles(o: dict[str, Any]) -> bool:
        if bilateral:
            return counterparty is not None and o.get("resolved_by") == counterparty
        return o.get("resolved_by") == "deterministic"

    def counter_claims(o: dict[str, Any]) -> bool:
        return bilateral and o.get("resolved_by") == swearer and not settles(o)

    # Every outcome in force, earliest first: the order the caller passes them in
    # must not change the state (§4.4: same inputs, same classification).
    # sorted() is stable, so outcomes dated alike keep the caller's order.
    outcomes = sorted(
        (
            o
            for o in [outcome, *(contradictory_outcomes or [])]
            if o is not None and in_force(o) and (settles(o) or counter_claims(o))
        ),
        key=lambda o: _parse_utc(o["resolved_at"]),
    )
    outcome = next((o for o in outcomes if settles(o)), None)
    if abandonment is not None and (
        abandonment.get("pledge_id") != pledge_id
        or (abandonment.get("sig") or {}).get("pubkey") != swearer
    ):
        abandonment = None

    # Abandonment trumps everything — SPEC §5.4 / WHY §H8.
    if abandonment is not None:
        return "broken"

    # The earliest settling outcome's window bounds only the resolver's own later
    # contradictions (§4.4). A swearer counter-claim contradicts whenever it is in
    # force: every date in an outcome is its signer's own claim, so a window the
    # counterparty sets and dates cannot bound the swearer (§4.5). A window that
    # cannot be read never closes.
    if outcome is not None:
        window_ends_ms = _parse_utc_or(outcome.get("dispute_window_ends_at"), None)
        contradicted = any(
            other.get("outcome") != outcome.get("outcome")
            and (
                counter_claims(other)
                or window_ends_ms is None
                or _dated_before(other.get("resolved_at"), window_ends_ms)
            )
            for other in outcomes
        )
        if contradicted:
            # §4.5: with no dispute mechanism, a dispute times out at expires_at.
            if (pledge.get("dispute") or {}).get("mechanism") is None and now_ms >= expires_at_ms:
                return "expired_unresolved"
            return "disputed"

    if outcome is not None:
        return outcome.get("outcome")  # type: ignore[return-value]

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
        block = r["block"]
        # A height that is not a JSON integer is no block (int() would read "5" or an Arabic-Indic digit).
        if isinstance(block, float) and block.is_integer():
            block = int(block)
        if not isinstance(block, int) or isinstance(block, bool):
            return None
        if chain.block_times and block in chain.block_times:
            return _parse_utc(chain.block_times[block])
        if chain.tip_height >= block:
            # Block has been mined; conservative bound is tip_time.
            return _parse_utc(chain.tip_time)
        return None  # not yet mined
    return None


def _parse_utc_or(iso: Any, fallback: Optional[int]) -> Optional[int]:
    """``iso`` in epoch ms, or ``fallback`` when it is not a timestamp."""
    try:
        return _parse_utc(iso)
    except (TypeError, ValueError):
        return fallback


def _dated_before(iso: Any, ms: int) -> bool:
    """True when ``iso`` is a timestamp earlier than ``ms``."""
    try:
        return _parse_utc(iso) < ms
    except (TypeError, ValueError):
        return False


def _dated_after(iso: Any, now_ms: int) -> bool:
    """True when ``iso`` is later than ``now_ms``, or not a timestamp at all."""
    try:
        return _parse_utc(iso) > now_ms
    except (TypeError, ValueError):
        return True


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
