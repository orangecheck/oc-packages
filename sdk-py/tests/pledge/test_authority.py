"""
SPEC §1, §4.3, §4.4, §5.3, §7.3: an outcome or abandonment counts only for the
pledge it names, from the party that pledge authorises, at a time the pledge
allows; an agent pledge counts only with its delegation checked.

Ported from pledge-core's outcome-authz.test.ts, pledge-binding.test.ts and
delegation.test.ts so both SDKs give the same answers.
"""

from __future__ import annotations

from typing import Any, Optional

from orangecheck.pledge import (
    ENVELOPE_VERSION,
    abandonment_input_from_dict,
    classify_state,
    compute_abandonment_id,
    compute_outcome_id,
    compute_pledge_id,
    outcome_input_from_dict,
    pledge_input_from_dict,
    verify_abandonment,
    verify_outcome,
    verify_pledge,
    wrap_pledge_envelope,
)

SWEARER = "bc1qswearer00000000000000000000000000000000"
OTHER = "bc1qother0000000000000000000000000000000000"
COUNTERPARTY = "bc1qcounter0000000000000000000000000000000"
MALLORY = "bc1qmallory0000000000000000000000000000000"
AGENT = "bc1qagent0000000000000000000000000000000000"

BASE: dict[str, Any] = {
    "swearer": SWEARER,
    "proposition": "Block 900000 will be mined.",
    "resolution": {"mechanism": "chain_state", "query": "block(900000).exists"},
    "resolves_at": {"time": "2026-06-01T00:00:00Z"},
    "expires_at": "2026-06-15T00:00:00Z",
    "bond": {"attestation_id": "3" * 64, "min_sats": 1_000, "min_days": 1},
    "counterparty": None,
    "dispute": {"mechanism": None, "params": None},
    "remediation": "breach_recorded",
    "sworn_at": "2026-04-20T09:00:00Z",
    "nonce": "fedcba9876543210fedcba9876543210",
}

BILATERAL: dict[str, Any] = {
    **BASE,
    "counterparty": COUNTERPARTY,
    "resolution": {
        "mechanism": "counterparty_signs",
        "query": f"counterparty({COUNTERPARTY}) signs outcome over pledge_id",
    },
}


def _pid(pledge: dict[str, Any]) -> str:
    return compute_pledge_id(pledge_input_from_dict(pledge))


def _outcome(
    pledge: dict[str, Any],
    *,
    outcome: str = "kept",
    resolved_at: str = "2026-06-02T00:00:00Z",
    resolved_by: str = "deterministic",
    mechanism: Optional[str] = None,
    pledge_id: Optional[str] = None,
) -> dict[str, Any]:
    canon = {
        "pledge_id": pledge_id or _pid(pledge),
        "outcome": outcome,
        "resolved_at": resolved_at,
        "resolved_by": resolved_by,
        "evidence": {
            "mechanism": mechanism or pledge["resolution"]["mechanism"],
            "result": "true",
            "witness": "chain_height=900000 chain_hash=" + "0" * 64,
        },
        "dispute_window_ends_at": "2026-06-20T00:00:00Z",
    }
    return {
        "v": ENVELOPE_VERSION,
        "kind": "pledge-outcome",
        "id": compute_outcome_id(outcome_input_from_dict(canon)),
        **canon,
        "sig": None
        if resolved_by == "deterministic"
        else {"alg": "bip322", "pubkey": resolved_by, "value": "AAAA"},
    }


def _abandonment(
    pledge: dict[str, Any],
    *,
    pubkey: Optional[str] = None,
    abandoned_at: str = "2026-05-01T00:00:00Z",
    pledge_id: Optional[str] = None,
) -> dict[str, Any]:
    canon = {
        "pledge_id": pledge_id or _pid(pledge),
        "abandoned_at": abandoned_at,
        "reason": "cannot deliver",
    }
    return {
        "v": ENVELOPE_VERSION,
        "kind": "pledge-abandonment",
        "id": compute_abandonment_id(abandonment_input_from_dict(canon)),
        **canon,
        "sig": {"alg": "bip322", "pubkey": pubkey or pledge["swearer"], "value": "AAAA"},
    }


def _envelope(pledge: dict[str, Any], **wrap: Any) -> dict[str, Any]:
    return wrap_pledge_envelope(pledge_input_from_dict(pledge), "AAAA", **wrap)


def _yes(_msg: str, _sig: str, _addr: str) -> bool:
    return True


# ─── verify_outcome: resolver authorization (SPEC §1, SECURITY §6) ───────


def test_outcome_rejects_a_stranger_who_names_themselves_and_self_signs() -> None:
    env = _outcome(BILATERAL, outcome="broken", resolved_by=MALLORY)
    r = verify_outcome(env, skip_signature_verification=True, pledge=pledge_input_from_dict(BILATERAL))
    assert not r.ok and r.code == "E_OUTCOME_RESOLVER_UNAUTHORIZED"


def test_outcome_rejects_unsigned_deterministic_on_counterparty_pledge() -> None:
    env = _outcome(BILATERAL, outcome="broken")
    r = verify_outcome(env, skip_signature_verification=True, pledge=pledge_input_from_dict(BILATERAL))
    assert not r.ok and r.code == "E_OUTCOME_RESOLVER_UNAUTHORIZED"


def test_outcome_rejects_address_signed_outcome_on_deterministic_pledge() -> None:
    env = _outcome(BASE, outcome="broken", resolved_by=MALLORY)
    r = verify_outcome(env, skip_signature_verification=True, pledge=pledge_input_from_dict(BASE))
    assert not r.ok and r.code == "E_OUTCOME_RESOLVER_UNAUTHORIZED"


def test_outcome_rejects_a_pledge_id_for_another_pledge() -> None:
    env = _outcome(BASE, outcome="broken")
    r = verify_outcome(env, skip_signature_verification=True, pledge=pledge_input_from_dict(BILATERAL))
    assert not r.ok and r.code == "E_OUTCOME_RESOLVER_UNAUTHORIZED"


def test_outcome_accepts_the_named_counterparty() -> None:
    env = _outcome(BILATERAL, resolved_by=COUNTERPARTY)
    r = verify_outcome(env, verify_bip322=_yes, pledge=pledge_input_from_dict(BILATERAL))
    assert r.ok and r.recompute_required is False


def test_outcome_accepts_deterministic_and_marks_it_for_recomputation() -> None:
    r = verify_outcome(_outcome(BASE), pledge=pledge_input_from_dict(BASE))
    assert r.ok and r.recompute_required is True


def test_outcome_accepts_the_pledge_as_an_envelope_dict() -> None:
    r = verify_outcome(_outcome(BASE), pledge=_envelope(BASE))
    assert r.ok


def test_outcome_rejects_evidence_for_another_mechanism() -> None:
    env = _outcome(BASE, mechanism="dns_record")
    r = verify_outcome(env, pledge=pledge_input_from_dict(BASE))
    assert not r.ok and r.code == "E_OUTCOME_EVIDENCE_MISMATCH"


def test_outcome_rejects_deterministic_dated_before_resolves_at() -> None:
    env = _outcome(BASE, resolved_at="2026-05-31T23:59:59Z")
    r = verify_outcome(env, pledge=pledge_input_from_dict(BASE))
    assert not r.ok and r.code == "E_OUTCOME_MALFORMED"


def test_outcome_rejects_expired_unresolved_before_expires_at() -> None:
    env = _outcome(BASE, outcome="expired_unresolved", resolved_at="2026-06-10T00:00:00Z")
    r = verify_outcome(env, pledge=pledge_input_from_dict(BASE))
    assert not r.ok and r.code == "E_OUTCOME_MALFORMED"


def test_outcome_fails_closed_without_a_pledge() -> None:
    env = _outcome(BILATERAL, resolved_by=COUNTERPARTY)
    r = verify_outcome(env, skip_signature_verification=True)
    assert not r.ok and r.code == "E_OUTCOME_RESOLVER_UNAUTHORIZED"
    assert "requires the pledge" in r.message


def test_outcome_skips_authorization_only_when_told_to() -> None:
    env = _outcome(BILATERAL, resolved_by=COUNTERPARTY)
    r = verify_outcome(env, skip_signature_verification=True, skip_resolver_authorization=True)
    assert r.ok


# ─── verify_abandonment: bound to the pledge (SPEC §5.3) ─────────────────


def test_abandonment_requires_the_pledge_or_an_explicit_skip() -> None:
    r = verify_abandonment(_abandonment(BASE), skip_signature_verification=True)
    assert not r.ok and r.code == "E_ABANDONMENT_BAD_SIG"


def test_abandonment_accepts_the_swearer() -> None:
    r = verify_abandonment(
        _abandonment(BASE), skip_signature_verification=True, pledge=pledge_input_from_dict(BASE)
    )
    assert r.ok


def test_abandonment_rejects_another_signer() -> None:
    r = verify_abandonment(
        _abandonment(BASE, pubkey=OTHER), verify_bip322=_yes, pledge=pledge_input_from_dict(BASE)
    )
    assert not r.ok and r.code == "E_ABANDONMENT_BAD_SIG"


def test_abandonment_rejects_another_pledge() -> None:
    r = verify_abandonment(
        _abandonment(BASE, pledge_id="e" * 64),
        skip_signature_verification=True,
        pledge=pledge_input_from_dict(BASE),
    )
    assert not r.ok and r.code == "E_ABANDONMENT_MALFORMED"


def test_abandonment_rejects_a_date_before_sworn_at() -> None:
    r = verify_abandonment(
        _abandonment(BASE, abandoned_at="2026-04-20T08:59:59Z"),
        skip_signature_verification=True,
        pledge=pledge_input_from_dict(BASE),
    )
    assert not r.ok and r.code == "E_ABANDONMENT_MALFORMED"


def test_abandonment_checks_the_signature_under_the_swearer() -> None:
    seen: list[str] = []

    def record(_m: str, _s: str, addr: str) -> bool:
        seen.append(addr)
        return True

    pledge = pledge_input_from_dict(BASE)
    assert verify_abandonment(_abandonment(BASE), verify_bip322=record, pledge=pledge).ok
    assert seen == [SWEARER]
    bad = verify_abandonment(_abandonment(BASE), verify_bip322=lambda *_: False, pledge=pledge)
    assert not bad.ok and bad.code == "E_ABANDONMENT_BAD_SIG"


def test_abandonment_skips_binding_only_when_told_to() -> None:
    r = verify_abandonment(
        _abandonment(BASE, pubkey=OTHER), skip_signature_verification=True, skip_pledge_binding=True
    )
    assert r.ok


# ─── classify_state: only envelopes about this pledge (SPEC §4.4, §5.3) ──

NOW = "2026-06-05T00:00:00Z"


def test_state_ignores_an_outcome_for_another_pledge() -> None:
    s = classify_state(
        pledge=_envelope(BASE),
        outcome=_outcome(BASE, outcome="broken", pledge_id="e" * 64),
        abandonment=None,
        now=NOW,
    )
    assert s == "resolvable"


def test_state_ignores_an_abandonment_for_another_pledge() -> None:
    s = classify_state(
        pledge=_envelope(BASE),
        outcome=None,
        abandonment=_abandonment(BASE, pledge_id="e" * 64),
        now=NOW,
    )
    assert s == "resolvable"


def test_state_ignores_an_abandonment_not_signed_by_the_swearer() -> None:
    s = classify_state(
        pledge=_envelope(BASE), outcome=None, abandonment=_abandonment(BASE, pubkey=OTHER), now=NOW
    )
    assert s == "resolvable"


def test_state_ignores_a_contradiction_about_another_pledge() -> None:
    s = classify_state(
        pledge=_envelope(BASE),
        outcome=_outcome(BASE, outcome="kept"),
        abandonment=None,
        now=NOW,
        contradictory_outcomes=[_outcome(BASE, outcome="broken", pledge_id="e" * 64)],
    )
    assert s == "kept"


def test_state_still_counts_the_swearer_abandoning_this_pledge() -> None:
    s = classify_state(pledge=_envelope(BASE), outcome=None, abandonment=_abandonment(BASE), now=NOW)
    assert s == "broken"


# ─── verify_pledge: an agent pledge needs its delegation (SPEC §7.3) ─────


def _agent_pledge() -> dict[str, Any]:
    return _envelope(
        BASE, sig_pubkey=AGENT, via_delegation={"delegation_id": "d" * 64, "agent_address": AGENT}
    )


def test_agent_pledge_refused_without_a_delegation_lookup() -> None:
    r = verify_pledge(_agent_pledge(), skip_signature_verification=True)
    assert not r.ok and r.code == "E_DELEGATION_NOT_FOUND"


def test_agent_pledge_skips_delegation_only_when_told_to() -> None:
    r = verify_pledge(
        _agent_pledge(), skip_signature_verification=True, skip_delegation_verification=True
    )
    assert r.ok
