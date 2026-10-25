"""
SPEC §0, §4.1, §5.1, §11.13: a signer keeps the free-text limits, a verifier
does not. A signed abandonment or outcome counts whatever the length or line
breaks of its reason or evidence. A verifier refuses a value that is not a
string, and a line feed in evidence.result, which would let another envelope
give the same bytes, as a result and never as an exception.

Ported from pledge-core's free-text.test.ts so both SDKs give the same
answers. BIP-322 is a stand-in that binds signature, message and address.
"""

from __future__ import annotations

from typing import Any

import pytest

from orangecheck.pledge import (
    PledgeError,
    classify_state,
    compute_abandonment_id,
    compute_outcome_id,
    compute_pledge_id,
    create_abandonment,
    create_outcome,
    pledge_input_from_dict,
    verify_abandonment,
    verify_outcome,
    wrap_abandonment_envelope,
)
from orangecheck.pledge.canonical import AbandonmentCanonicalInput, OutcomeCanonicalInput, OutcomeEvidence

SWEARER = "bc1qswearer00000000000000000000000000000000"
COUNTERPARTY = "bc1qcounter0000000000000000000000000000000"
LONE = chr(0xD800)

PLEDGE: dict[str, Any] = {
    "swearer": SWEARER,
    "proposition": "I will deliver the audit report to the counterparty.",
    "resolution": {
        "mechanism": "counterparty_signs",
        "query": f"counterparty({COUNTERPARTY}) signs outcome over pledge_id",
    },
    "resolves_at": {"time": "2027-01-01T00:00:00Z"},
    "expires_at": "2027-02-01T00:00:00Z",
    "bond": {"attestation_id": "c" * 64, "min_sats": 1000, "min_days": 1},
    "counterparty": COUNTERPARTY,
    "dispute": {"mechanism": None, "params": None},
    "remediation": "breach_recorded",
    "sworn_at": "2026-10-20T00:00:00Z",
    "nonce": "0123456789abcdef0123456789abcdef",
}
CANON = pledge_input_from_dict(PLEDGE)
PLEDGE_ID = compute_pledge_id(CANON)


def _sign(addr: str, msg: str) -> str:
    return f"sig:{addr}:{msg}"


def _verify(msg: str, sig: str, addr: str) -> bool:
    return sig == _sign(addr, msg)


def _abandonment(reason: Any, abandoned_at: Any = "2026-11-01T00:00:00Z") -> dict[str, Any]:
    """An abandonment the swearer signed, built by hand: the producers refuse odd ones."""
    canon = AbandonmentCanonicalInput(pledge_id=PLEDGE_ID, abandoned_at=abandoned_at, reason=reason)
    aid = compute_abandonment_id(canon) if isinstance(reason, str) else "a" * 64
    return {
        "v": 1,
        "kind": "pledge-abandonment",
        "id": aid,
        "pledge_id": PLEDGE_ID,
        "abandoned_at": abandoned_at,
        "reason": reason,
        "sig": {"alg": "bip322", "pubkey": SWEARER, "value": _sign(SWEARER, aid)},
    }


def _outcome(result: Any, witness: Any) -> dict[str, Any]:
    """A broken outcome the counterparty signed, with this evidence."""
    canon = OutcomeCanonicalInput(
        pledge_id=PLEDGE_ID,
        outcome="broken",
        resolved_at="2027-01-02T00:00:00Z",
        resolved_by=COUNTERPARTY,
        evidence=OutcomeEvidence(mechanism="counterparty_signs", result=result, witness=witness),
        dispute_window_ends_at="2027-01-09T00:00:00Z",
    )
    typed = isinstance(result, str) and isinstance(witness, str)
    oid = compute_outcome_id(canon) if typed else "b" * 64
    return {
        "v": 1,
        "kind": "pledge-outcome",
        "id": oid,
        "pledge_id": PLEDGE_ID,
        "outcome": "broken",
        "resolved_at": "2027-01-02T00:00:00Z",
        "resolved_by": COUNTERPARTY,
        "evidence": {"mechanism": "counterparty_signs", "result": result, "witness": witness},
        "dispute_window_ends_at": "2027-01-09T00:00:00Z",
        "sig": {"alg": "bip322", "pubkey": COUNTERPARTY, "value": _sign(COUNTERPARTY, oid)},
    }


def _pledge_envelope() -> dict[str, Any]:
    return {
        "v": 1,
        "kind": "pledge",
        "id": PLEDGE_ID,
        "swearer": {"address": SWEARER, "alg": "bip322"},
        **{k: v for k, v in PLEDGE.items() if k != "swearer"},
        "sig": {"alg": "bip322", "pubkey": SWEARER, "value": _sign(SWEARER, PLEDGE_ID)},
    }


@pytest.mark.parametrize(
    "reason",
    ["r" * 281, chr(0xE9) * 2000, "", f"lost {LONE} key", "cannot deliver\nsorry", "a\r\nb"],
    ids=["281-bytes", "4000-bytes", "empty", "lone-surrogate", "line-feed", "crlf"],
)
def test_a_signed_abandonment_counts_whatever_its_reason(reason: str) -> None:
    env = _abandonment(reason)
    r = verify_abandonment(env, verify_bip322=_verify, pledge=CANON)
    assert r.ok, getattr(r, "message", "")
    state = classify_state(
        pledge=_pledge_envelope(), outcome=None, abandonment=env, now="2026-11-02T00:00:00Z"
    )
    assert state == "broken"


@pytest.mark.parametrize(
    ("reason", "abandoned_at"),
    [
        (5, "2026-11-01T00:00:00Z"),
        (None, "2026-11-01T00:00:00Z"),
        ("cannot deliver", 5),
    ],
    ids=["number", "null", "abandoned-at-number"],
)
def test_an_odd_abandonment_is_malformed_not_an_exception(reason: Any, abandoned_at: Any) -> None:
    r = verify_abandonment(_abandonment(reason, abandoned_at), verify_bip322=_verify, pledge=CANON)
    assert not r.ok
    assert r.code == "E_ABANDONMENT_MALFORMED"


def test_a_stranger_signed_abandonment_is_still_refused() -> None:
    env = _abandonment("r" * 281)
    env["sig"]["value"] = _sign(COUNTERPARTY, env["id"])
    r = verify_abandonment(env, verify_bip322=_verify, pledge=CANON)
    assert not r.ok and r.code == "E_ABANDONMENT_BAD_SIG"


@pytest.mark.parametrize(
    ("result", "witness"),
    [("", ""), ("r" * 5000, "w" * 5000), ("broken", "w\n  witness: x"), ("broken\r", "w")],
    ids=["empty", "long", "witness-lines", "result-carriage-return"],
)
def test_a_signed_outcome_counts_whatever_its_evidence(result: str, witness: str) -> None:
    r = verify_outcome(_outcome(result, witness), verify_bip322=_verify, pledge=CANON)
    assert r.ok, getattr(r, "message", "")


@pytest.mark.parametrize(
    ("result", "witness"),
    [("broken\n  witness: x", "w"), ("broken", 7)],
    ids=["line-feed-result", "witness-number"],
)
def test_an_odd_outcome_is_malformed_not_an_exception(result: Any, witness: Any) -> None:
    r = verify_outcome(_outcome(result, witness), verify_bip322=_verify, pledge=CANON)
    assert not r.ok
    assert r.code == "E_OUTCOME_MALFORMED"


class _Signer:
    def __init__(self, address: str) -> None:
        self.address = address

    def sign_message(self, msg: str) -> str:
        return _sign(self.address, msg)


@pytest.mark.parametrize(
    "reason",
    ["r" * 281, "", "cannot\ndeliver", f"lost {LONE}", 5],
    ids=["281-bytes", "empty", "two-lines", "lone-surrogate", "number"],
)
def test_a_signer_keeps_the_limits(reason: Any) -> None:
    with pytest.raises(PledgeError) as e:
        create_abandonment(
            pledge_id=PLEDGE_ID,
            abandoned_at="2026-11-01T00:00:00Z",
            reason=reason,
            swearer_signer=_Signer(SWEARER),
        )
    assert e.value.code == "E_ABANDONMENT_MALFORMED"
    canon = AbandonmentCanonicalInput(
        pledge_id=PLEDGE_ID, abandoned_at="2026-11-01T00:00:00Z", reason=reason
    )
    with pytest.raises(PledgeError):
        wrap_abandonment_envelope(canon, "sig", SWEARER)


def test_a_signer_may_write_280_bytes() -> None:
    env = create_abandonment(
        pledge_id=PLEDGE_ID,
        abandoned_at="2026-11-01T00:00:00Z",
        reason="r" * 280,
        swearer_signer=_Signer(SWEARER),
    )
    assert env["reason"] == "r" * 280


@pytest.mark.parametrize("witness", ["", "w\nx"], ids=["empty", "two-lines"])
def test_a_resolver_may_not_sign_evidence_off_one_line(witness: str) -> None:
    with pytest.raises(PledgeError) as e:
        create_outcome(
            pledge_id=PLEDGE_ID,
            outcome="broken",
            resolved_at="2027-01-02T00:00:00Z",
            resolved_by=COUNTERPARTY,
            evidence={"mechanism": "counterparty_signs", "result": "broken", "witness": witness},
            dispute_window_ends_at="2027-01-09T00:00:00Z",
            signer=_Signer(COUNTERPARTY),
        )
    assert e.value.code == "E_OUTCOME_MALFORMED"


def test_a_lone_surrogate_hashes_as_u_fffd_as_pledge_core_does() -> None:
    lone = AbandonmentCanonicalInput(pledge_id=PLEDGE_ID, abandoned_at="2026-11-01T00:00:00Z", reason=f"a{LONE}b")
    fffd = AbandonmentCanonicalInput(pledge_id=PLEDGE_ID, abandoned_at="2026-11-01T00:00:00Z", reason=f"a{chr(0xFFFD)}b")
    assert compute_abandonment_id(lone) == compute_abandonment_id(fffd)
