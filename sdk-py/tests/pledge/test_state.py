"""
SPEC §4.3–§4.5: who settles a pledge, and when a contradiction disputes it.

Ported from pledge-core's state.test.ts so both SDKs give the same answers.
"""

from __future__ import annotations

from typing import Any, Optional

from orangecheck.pledge import classify_state


def _pledge(**opts: Any) -> dict[str, Any]:
    return {
        "v": 1,
        "kind": "pledge",
        "id": "a" * 64,
        "swearer": {"address": "bc1qalice", "alg": "bip322"},
        "proposition": "p",
        "resolution": {"mechanism": "chain_state", "query": "q"},
        "resolves_at": {"time": "2026-09-01T00:00:00Z"},
        "expires_at": "2026-12-31T00:00:00Z",
        "bond": {"attestation_id": "0" * 64, "min_sats": 0, "min_days": 0},
        "counterparty": None,
        "dispute": {"mechanism": None, "params": None},
        "remediation": "breach_recorded",
        "sworn_at": "2026-04-24T18:30:00Z",
        "nonce": "0" * 32,
        "sig": {"alg": "bip322", "pubkey": "bc1qalice", "value": "AAAA"},
        **opts,
    }


def _outcome(**opts: Any) -> dict[str, Any]:
    return {
        "v": 1,
        "kind": "pledge-outcome",
        "id": "b" * 64,
        "pledge_id": "a" * 64,
        "outcome": "kept",
        "resolved_at": "2026-09-01T00:00:00Z",
        "resolved_by": "deterministic",
        "evidence": {"mechanism": "chain_state", "result": "true", "witness": "w"},
        "dispute_window_ends_at": "2026-09-08T00:00:00Z",
        "sig": None,
        **opts,
    }


def test_disputed_when_a_contradiction_has_a_different_verdict() -> None:
    s = classify_state(
        pledge=_pledge(),
        outcome=_outcome(outcome="kept"),
        abandonment=None,
        now="2026-10-01T00:00:00Z",
        contradictory_outcomes=[_outcome(outcome="broken")],
    )
    assert s == "disputed"


# ─── a swearer counter-claim under counterparty_signs (§4.3, §4.5) ───────

BILATERAL = _pledge(
    resolution={"mechanism": "counterparty_signs", "query": "q"},
    counterparty="bc1qbob",
)


def _by(resolved_by: str, **o: Any) -> dict[str, Any]:
    return _outcome(
        resolved_by=resolved_by,
        evidence={"mechanism": "counterparty_signs", "result": "r", "witness": "w"},
        **o,
    )


def _claim(**o: Any) -> dict[str, Any]:
    return _by("bc1qalice", **{"id": "c" * 64, **o})


def _counterparty(**o: Any) -> dict[str, Any]:
    return _by("bc1qbob", **o)


def _at(now: str, outcomes: list[dict[str, Any]], pledge: Optional[dict[str, Any]] = None) -> str:
    return classify_state(
        pledge=pledge or BILATERAL,
        outcome=outcomes[0] if outcomes else None,
        abandonment=None,
        now=now,
        contradictory_outcomes=outcomes[1:],
    )


def test_counter_claim_alone_never_settles_the_pledge() -> None:
    for result in ("kept", "broken"):
        assert _at("2026-10-01T00:00:00Z", [_claim(outcome=result)]) == "resolvable"
        assert _at("2027-01-01T00:00:00Z", [_claim(outcome=result)]) == "expired_unresolved"


def test_counter_claim_disputes_the_counterparty_inside_its_window() -> None:
    broken = _counterparty(
        outcome="broken", resolved_at="2026-09-02T00:00:00Z", dispute_window_ends_at="2026-09-09T00:00:00Z"
    )
    # Dated before the counterparty's outcome, or inside its window.
    before = _claim(outcome="kept", resolved_at="2026-09-01T00:00:00Z")
    inside = _claim(outcome="kept", resolved_at="2026-09-05T00:00:00Z")
    assert _at("2026-10-01T00:00:00Z", [before, broken]) == "disputed"
    assert _at("2026-10-01T00:00:00Z", [broken, inside]) == "disputed"


def test_counter_claim_contradicts_after_the_counterparty_window() -> None:
    # The counterparty's dates cannot bound the swearer.
    broken = _counterparty(
        outcome="broken", resolved_at="2026-09-02T00:00:00Z", dispute_window_ends_at="2026-09-09T00:00:00Z"
    )
    after = _claim(outcome="kept", resolved_at="2026-09-10T00:00:00Z")
    assert _at("2026-10-01T00:00:00Z", [broken, after]) == "disputed"


def test_zero_length_counterparty_window_does_not_shut_out_an_honest_counter_claim() -> None:
    shut = _counterparty(
        outcome="broken", resolved_at="2026-09-02T00:00:00Z", dispute_window_ends_at="2026-09-02T00:00:00Z"
    )
    honest = _claim(outcome="kept", resolved_at="2026-09-02T01:00:00Z")
    assert _at("2026-10-01T00:00:00Z", [shut, honest]) == "disputed"
    # No dispute mechanism: it times out at expires_at (12-31).
    assert _at("2026-12-31T00:00:00Z", [shut, honest]) == "expired_unresolved"


def test_counter_claim_dated_at_or_after_expires_at_does_not_enter() -> None:
    broken = _counterparty(
        outcome="broken", resolved_at="2026-09-02T00:00:00Z", dispute_window_ends_at="2026-09-09T00:00:00Z"
    )
    late = _claim(outcome="kept", resolved_at="2026-12-31T00:00:00Z")
    assert _at("2027-01-02T00:00:00Z", [broken, late]) == "broken"


def test_counterparty_contradicting_itself_after_its_window_leaves_the_first_outcome() -> None:
    kept = _counterparty(
        outcome="kept", resolved_at="2026-09-02T00:00:00Z", dispute_window_ends_at="2026-09-09T00:00:00Z"
    )
    later = _counterparty(id="e" * 64, outcome="broken", resolved_at="2026-09-10T00:00:00Z")
    assert _at("2026-10-01T00:00:00Z", [kept, later]) == "kept"


def test_counter_claim_agreeing_with_the_counterparty_changes_nothing() -> None:
    kept = _counterparty(outcome="kept")
    assert _at("2026-10-01T00:00:00Z", [_claim(outcome="kept"), kept]) == "kept"


def test_a_swearer_named_as_counterparty_settles_and_is_held_to_its_window() -> None:
    own = _pledge(resolution={"mechanism": "counterparty_signs", "query": "q"}, counterparty="bc1qalice")
    kept = _by(
        "bc1qalice", outcome="kept", resolved_at="2026-09-02T00:00:00Z", dispute_window_ends_at="2026-09-09T00:00:00Z"
    )
    later = _by("bc1qalice", id="e" * 64, outcome="broken", resolved_at="2026-09-10T00:00:00Z")
    assert _at("2026-10-01T00:00:00Z", [kept, later], own) == "kept"


def test_a_strangers_envelope_neither_settles_nor_disputes() -> None:
    stranger = _by("bc1qmallory", id="d" * 64, outcome="kept")
    assert _at("2026-10-01T00:00:00Z", [stranger]) == "resolvable"
    assert _at("2026-10-01T00:00:00Z", [_counterparty(outcome="broken"), stranger]) == "broken"


# ─── a dispute (§4.4, §4.5) ──────────────────────────────────────────────
# kept on 09-01 with its window to 09-08; the pledge expires 12-31.

KEPT = _outcome(outcome="kept")
BROKEN_IN = _outcome(id="b" * 64, outcome="broken", resolved_at="2026-09-05T00:00:00Z")
BROKEN_AFTER = _outcome(id="c" * 64, outcome="broken", resolved_at="2026-09-10T00:00:00Z")


def _against_kept(now: str, others: list[dict[str, Any]], pledge: Optional[dict[str, Any]] = None) -> str:
    return classify_state(
        pledge=pledge or _pledge(), outcome=KEPT, abandonment=None, now=now, contradictory_outcomes=others
    )


def test_dispute_counts_a_contradiction_inside_the_earliest_window() -> None:
    assert _against_kept("2026-10-01T00:00:00Z", [BROKEN_IN]) == "disputed"


def test_dispute_ignores_one_dated_after_that_window() -> None:
    # The earliest outcome is final.
    assert _against_kept("2026-10-01T00:00:00Z", [BROKEN_AFTER]) == "kept"


def test_dispute_window_that_cannot_be_read_never_closes() -> None:
    unread = _outcome(outcome="kept", dispute_window_ends_at="not a date")
    s = classify_state(
        pledge=_pledge(),
        outcome=unread,
        abandonment=None,
        now="2026-10-01T00:00:00Z",
        contradictory_outcomes=[BROKEN_AFTER],
    )
    assert s == "disputed"


def test_dispute_times_out_at_expires_at_with_no_dispute_mechanism() -> None:
    assert _against_kept("2026-12-30T23:59:59Z", [BROKEN_IN]) == "disputed"
    assert _against_kept("2026-12-31T00:00:00Z", [BROKEN_IN]) == "expired_unresolved"


def test_dispute_stays_after_expires_at_when_a_mechanism_is_named() -> None:
    with_vote = _pledge(dispute={"mechanism": "vote_resolves", "params": "poll_id=p;option=kept;threshold=0.5"})
    assert _against_kept("2027-01-01T00:00:00Z", [BROKEN_IN], with_vote) == "disputed"


def test_dispute_reads_the_same_whatever_order_the_outcomes_come_in() -> None:
    s = classify_state(
        pledge=_pledge(),
        outcome=BROKEN_AFTER,
        abandonment=None,
        now="2026-10-01T00:00:00Z",
        contradictory_outcomes=[KEPT],
    )
    assert s == "kept"
