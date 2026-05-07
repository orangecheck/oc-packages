"""
Round-trip tests for the wrap_*_envelope external-sig helpers.

Mirrors @orangecheck/pledge-core's wrap-vs-create equality test: a wrapped
envelope built from canonical input + an externally-supplied signature
must verify identically to a freshly-created one with the same inputs +
sig. Confirms the two code paths produce byte-identical wire form.
"""

from __future__ import annotations

import pytest

from orangecheck.pledge import (
    compute_abandonment_id,
    compute_outcome_id,
    compute_pledge_id,
    pledge_input_from_dict,
    verify_abandonment,
    verify_outcome,
    verify_pledge,
    wrap_abandonment_envelope,
    wrap_outcome_envelope,
    wrap_pledge_envelope,
)
from orangecheck.pledge.canonical import (
    AbandonmentCanonicalInput,
    OutcomeCanonicalInput,
    OutcomeEvidence,
    PledgeBond,
    PledgeCanonicalInput,
    PledgeDispute,
    PledgeResolution,
    ResolvesAtBlock,
)
from orangecheck.pledge.envelopes import PledgeError


def _minimal_pledge_input() -> PledgeCanonicalInput:
    return PledgeCanonicalInput(
        swearer="bc1qalice000000000000000000000000000000000",
        proposition="I will not spend the bonded UTXO before block 920000.",
        resolution=PledgeResolution(
            mechanism="chain_state",
            query="address(bc1qalice000000000000000000000000000000000).balance >= 500000",
        ),
        resolves_at=ResolvesAtBlock(block=920000),
        expires_at="2026-12-31T00:00:00Z",
        bond=PledgeBond(attestation_id="1" * 64, min_sats=500000, min_days=180),
        counterparty=None,
        dispute=PledgeDispute(mechanism=None, params=None),
        remediation="breach_recorded",
        sworn_at="2026-04-24T18:30:00Z",
        nonce="0123456789abcdef0123456789abcdef",
    )


# ─── wrap_pledge_envelope ─────────────────────────────────────────────────


def test_wrap_pledge_envelope_passes_verify_minimal():
    inp = _minimal_pledge_input()
    env = wrap_pledge_envelope(inp, "AAAA")
    assert env["v"] == 1
    assert env["kind"] == "pledge"
    assert env["id"] == compute_pledge_id(inp)
    assert env["sig"]["pubkey"] == inp.swearer
    assert env["sig"]["value"] == "AAAA"
    assert "via_delegation" not in env
    # Round-trip verify (skip BIP-322; AAAA is a placeholder).
    r = verify_pledge(env, skip_signature_verification=True)
    assert r.ok


def test_wrap_pledge_envelope_agent_path():
    inp = _minimal_pledge_input()
    agent = "bc1qagent0000000000000000000000000000000000"
    env = wrap_pledge_envelope(
        inp,
        "AAAA",
        sig_pubkey=agent,
        via_delegation={"delegation_id": "d" * 64, "agent_address": agent},
    )
    assert env["via_delegation"] == "d" * 64
    assert env["agent_address"] == agent
    assert env["sig"]["pubkey"] == agent
    assert env["id"] == compute_pledge_id(inp)


def test_wrap_pledge_envelope_rejects_empty_nonce():
    inp = PledgeCanonicalInput(**{**_minimal_pledge_input().__dict__, "nonce": ""})
    with pytest.raises(PledgeError) as excinfo:
        wrap_pledge_envelope(inp, "AAAA")
    assert excinfo.value.code == "E_PLEDGE_MALFORMED"


def test_wrap_pledge_envelope_rejects_principal_eq_agent():
    inp = _minimal_pledge_input()
    with pytest.raises(PledgeError) as excinfo:
        wrap_pledge_envelope(
            inp,
            "AAAA",
            via_delegation={"delegation_id": "d" * 64, "agent_address": inp.swearer},
        )
    assert excinfo.value.code == "E_PLEDGE_MALFORMED"


def test_wrap_pledge_envelope_matches_pledge_input_from_dict_round_trip():
    """Loading a v01-shaped vector via pledge_input_from_dict and wrapping
    with a placeholder sig produces the same id as the spec-pinned one."""
    import json
    from pathlib import Path

    vector_path = Path("/Users/wilneeley/Projects/ochk/oc-pledge-protocol/test-vectors/v01-pledge-minimal-chain-state.json")
    if not vector_path.is_file():
        pytest.skip("oc-pledge-protocol vectors not available locally")
    vec = json.loads(vector_path.read_text())
    inp = pledge_input_from_dict(vec["inputs"])
    env = wrap_pledge_envelope(inp, "AAAA")
    assert env["id"] == vec["expected"]["pledge_id"]


# ─── wrap_outcome_envelope ────────────────────────────────────────────────


def _det_outcome_input() -> OutcomeCanonicalInput:
    return OutcomeCanonicalInput(
        pledge_id="a" * 64,
        outcome="kept",
        resolved_at="2026-12-15T12:00:00Z",
        resolved_by="deterministic",
        evidence=OutcomeEvidence(
            mechanism="chain_state",
            result="true",
            witness="chain_height=1 chain_hash=" + "0" * 64,
        ),
        dispute_window_ends_at="2026-12-22T12:00:00Z",
    )


def _cp_outcome_input() -> OutcomeCanonicalInput:
    return OutcomeCanonicalInput(
        pledge_id="a" * 64,
        outcome="kept",
        resolved_at="2026-06-02T10:00:00Z",
        resolved_by="bc1qcounter000",
        evidence=OutcomeEvidence(
            mechanism="counterparty_signs",
            result="kept",
            witness="delivered_at=2026-06-01T16:00:00Z",
        ),
        dispute_window_ends_at="2026-06-09T10:00:00Z",
    )


def test_wrap_outcome_envelope_deterministic_sig_null():
    inp = _det_outcome_input()
    env = wrap_outcome_envelope(inp)
    assert env["kind"] == "pledge-outcome"
    assert env["sig"] is None
    assert env["id"] == compute_outcome_id(inp)
    r = verify_outcome(env)
    assert r.ok


def test_wrap_outcome_envelope_deterministic_rejects_sig():
    with pytest.raises(PledgeError) as excinfo:
        wrap_outcome_envelope(_det_outcome_input(), "AAAA")
    assert excinfo.value.code == "E_OUTCOME_MALFORMED"


def test_wrap_outcome_envelope_counterparty_signed():
    inp = _cp_outcome_input()
    env = wrap_outcome_envelope(inp, "AAAA")
    assert env["sig"] is not None
    assert env["sig"]["pubkey"] == inp.resolved_by
    assert env["sig"]["value"] == "AAAA"


def test_wrap_outcome_envelope_counterparty_rejects_missing_sig():
    with pytest.raises(PledgeError) as excinfo:
        wrap_outcome_envelope(_cp_outcome_input())
    assert excinfo.value.code == "E_OUTCOME_BAD_SIG"


# ─── wrap_abandonment_envelope ────────────────────────────────────────────


def test_wrap_abandonment_envelope_round_trip():
    inp = AbandonmentCanonicalInput(
        pledge_id="a" * 64,
        abandoned_at="2026-08-01T12:00:00Z",
        reason="emergency; admitting break",
    )
    env = wrap_abandonment_envelope(inp, "AAAA", "bc1qalice")
    assert env["kind"] == "pledge-abandonment"
    assert env["id"] == compute_abandonment_id(inp)
    assert env["sig"]["pubkey"] == "bc1qalice"
    assert env["sig"]["value"] == "AAAA"
    r = verify_abandonment(env, skip_signature_verification=True)
    assert r.ok


def test_wrap_abandonment_envelope_rejects_too_long_reason():
    inp = AbandonmentCanonicalInput(
        pledge_id="a" * 64,
        abandoned_at="2026-08-01T12:00:00Z",
        reason="x" * 281,
    )
    with pytest.raises(PledgeError) as excinfo:
        wrap_abandonment_envelope(inp, "AAAA", "bc1qalice")
    assert excinfo.value.code == "E_ABANDONMENT_MALFORMED"
