"""
Cross-implementation conformance harness — Python SDK ↔ oc-pledge-protocol.

Loads every committed vector in oc-pledge-protocol/test-vectors/ and
asserts byte-identical reproduction. A failure means either:

  (a) The spec moved: re-vendor the vectors, OR
  (b) The Python SDK drifted: fix orangecheck/pledge/canonical.py.

Same 28-vector battery the TypeScript SDK runs against. The two SDKs
producing identical canonical bytes + ids on every vector is what makes
the homepage's "cross-impl, where it counts" claim apply to OC Pledge —
this harness is the gate.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from orangecheck.pledge import (
    abandonment_input_from_dict,
    canonical_abandonment_message,
    canonical_abandonment_message_bytes,
    canonical_outcome_message,
    canonical_outcome_message_bytes,
    canonical_pledge_message,
    canonical_pledge_message_bytes,
    classify_state,
    compute_abandonment_id,
    compute_outcome_id,
    compute_pledge_id,
    create_pledge,
    outcome_input_from_dict,
    pledge_input_from_dict,
    verify_abandonment,
    verify_bond,
    verify_outcome,
    verify_pledge,
)
from orangecheck.pledge.bond import AttestationLookupResult
from orangecheck.pledge.delegation import DelegationLookupResult, check_pledge_create_scope
from orangecheck.pledge.envelopes import PledgeError


def locate_vectors_dir() -> Path | None:
    env = os.environ.get("OC_PLEDGE_VECTORS_DIR")
    if env and Path(env).is_dir():
        return Path(env)
    # A clone of oc-pledge-protocol next to oc-packages.
    sibling = Path(__file__).resolve().parents[4] / "oc-pledge-protocol" / "test-vectors"
    if sibling.is_dir():
        return sibling
    return None


def load_vectors() -> list[tuple[str, dict[str, Any]]]:
    d = locate_vectors_dir()
    if d is None:
        return []
    out: list[tuple[str, dict[str, Any]]] = []
    for path in sorted(d.glob("*.json")):
        out.append((path.name, json.loads(path.read_text())))
    return out


VECTORS = load_vectors()


@pytest.fixture(autouse=True, scope="module")
def _vectors_present() -> None:
    if not VECTORS:
        pytest.skip(
            "no test-vectors directory found — set OC_PLEDGE_VECTORS_DIR or "
            "sibling-clone oc-pledge-protocol"
        )


def _ids() -> list[str]:
    return [name for (name, _) in VECTORS]


@pytest.mark.parametrize(("name", "data"), VECTORS, ids=_ids())
def test_vector(name: str, data: dict[str, Any]) -> None:
    kind = data["kind"]
    if kind == "pledge":
        _run_pledge(data)
    elif kind == "pledge-outcome":
        _run_outcome(data)
    elif kind == "pledge-abandonment":
        _run_abandonment(data)
    elif kind == "bond-verification":
        _run_bond(data)
    elif kind == "state-transition":
        _run_state(data)
    elif kind == "malformed-input":
        _run_malformed(data)
    elif kind == "scope-check":
        _run_scope_check(data)
    else:
        pytest.fail(f"unknown vector kind in {name}: {kind}")


# ─── Shape A — pledge ─────────────────────────────────────────────────────


def _run_pledge(vec: dict[str, Any]) -> None:
    inputs = vec["inputs"]
    expected = vec["expected"]

    canon = pledge_input_from_dict(inputs)
    msg = canonical_pledge_message(canon)
    assert msg == expected["canonical_message"]
    # SPEC §0: a lone surrogate (v37) counts as the three bytes of U+FFFD.
    assert len(canonical_pledge_message_bytes(canon)) == expected["canonical_message_bytes_len"]

    pid = compute_pledge_id(canon)
    assert pid == expected["pledge_id"]
    assert pid == expected["envelope"]["id"]

    r = verify_pledge(
        expected["envelope"],
        skip_signature_verification=True,
        skip_delegation_verification=True,
    )
    assert r.ok, f"verify_pledge failed: {getattr(r, 'code', '?')} {getattr(r, 'message', '?')}"


# ─── Shape A — outcome ────────────────────────────────────────────────────


def _run_outcome(vec: dict[str, Any]) -> None:
    inputs = vec["inputs"]
    expected = vec["expected"]

    canon = outcome_input_from_dict(inputs)
    msg = canonical_outcome_message(canon)
    assert msg == expected["canonical_message"]
    # SPEC §0: a lone surrogate (v37) counts as the three bytes of U+FFFD.
    assert len(canonical_outcome_message_bytes(canon)) == expected["canonical_message_bytes_len"]

    oid = compute_outcome_id(canon)
    assert oid == expected["outcome_id"]
    assert oid == expected["envelope"]["id"]

    r = verify_outcome(
        expected["envelope"],
        skip_signature_verification=True,
        skip_resolver_authorization=True,
    )
    assert r.ok, f"verify_outcome failed: {getattr(r, 'code', '?')} {getattr(r, 'message', '?')}"


# ─── Shape A — abandonment ────────────────────────────────────────────────


def _run_abandonment(vec: dict[str, Any]) -> None:
    inputs = vec["inputs"]
    expected = vec["expected"]

    canon = abandonment_input_from_dict(inputs)
    msg = canonical_abandonment_message(canon)
    assert msg == expected["canonical_message"]
    # SPEC §0: a lone surrogate (v37) counts as the three bytes of U+FFFD.
    assert len(canonical_abandonment_message_bytes(canon)) == expected["canonical_message_bytes_len"]

    aid = compute_abandonment_id(canon)
    assert aid == expected["abandonment_id"]
    assert aid == expected["envelope"]["id"]

    r = verify_abandonment(
        expected["envelope"], skip_signature_verification=True, skip_pledge_binding=True
    )
    assert (
        r.ok
    ), f"verify_abandonment failed: {getattr(r, 'code', '?')} {getattr(r, 'message', '?')}"


# ─── Shape B — bond-verification (v18-v20) ────────────────────────────────


def _run_bond(vec: dict[str, Any]) -> None:
    inputs = vec["inputs"]
    expected = vec["expected"]
    bond = inputs["bond"]
    attest_d = inputs["attestation_resolved"]

    swearer_address = attest_d["address"]
    pledge = {
        "v": 1,
        "kind": "pledge",
        "id": "0" * 64,
        "swearer": {"address": swearer_address, "alg": "bip322"},
        "proposition": "synthetic",
        "resolution": {"mechanism": "chain_state", "query": "synthetic"},
        "resolves_at": {"block": int(inputs.get("resolves_at_block", 0))},
        "expires_at": "2099-01-01T00:00:00Z",
        "bond": bond,
        "counterparty": None,
        "dispute": {"mechanism": None, "params": None},
        "remediation": "breach_recorded",
        "sworn_at": "2026-01-01T00:00:00Z",
        "nonce": "0" * 32,
        "sig": {"alg": "bip322", "pubkey": swearer_address, "value": "AAAA"},
    }

    spent_at_block = attest_d.get("spent_at_block")
    valid_at_block = attest_d.get("valid_at_block")
    spent = (
        spent_at_block is not None
        and valid_at_block is not None
        and int(spent_at_block) <= int(valid_at_block)
    )
    attestation = AttestationLookupResult(
        address=attest_d["address"],
        sats_bonded=int(attest_d["sats_bonded"]),
        days_unspent=int(attest_d["days_unspent"]),
        utxo_spent_at_or_before_now=spent,
    )

    r = verify_bond(pledge=pledge, now="2026-12-31T00:00:00Z", attestation=attestation)
    expected_ok = bool(expected["ok"])
    expected_code = expected.get("code")
    assert r.ok is expected_ok
    if not r.ok and expected_code is not None:
        assert r.code == expected_code


# ─── Shape B — state-transition ───────────────────────────────────────────


def _run_state(vec: dict[str, Any]) -> None:
    inputs = vec["inputs"]
    expected = vec["expected"]
    expected_state = expected["state"]

    if isinstance(inputs.get("outcomes"), list):
        # Bilateral sub-shape (v21, v22).
        outcomes = inputs["outcomes"]
        pledge_id = inputs["pledge_id"]
        pledge = _synthetic_pledge(pledge_id, "2099-01-01T00:00:00Z")
        stub_outcomes = [
            _outcome_stub(pledge_id, o["outcome"], o["resolved_at"]) for o in outcomes
        ]
        state = classify_state(
            pledge=pledge,
            outcome=stub_outcomes[0] if stub_outcomes else None,
            abandonment=None,
            now=inputs["now"],
            contradictory_outcomes=stub_outcomes[1:] if len(stub_outcomes) > 1 else None,
        )
    else:
        # Standard sub-shape (v23-v27, v47-v54): outcome_envelope (or null), or
        # outcome_envelopes (several, in any order).
        pledge_inputs = inputs["pledge"]
        pledge_canon = pledge_input_from_dict(pledge_inputs)
        pledge_id = compute_pledge_id(pledge_canon)
        pledge = {
            "v": 1,
            "kind": "pledge",
            "id": pledge_id,
            "swearer": {"address": pledge_canon.swearer, "alg": "bip322"},
            "proposition": pledge_canon.proposition,
            "resolution": {
                "mechanism": pledge_canon.resolution.mechanism,
                "query": pledge_canon.resolution.query,
            },
            "resolves_at": pledge_inputs["resolves_at"],
            "expires_at": pledge_canon.expires_at,
            "bond": {
                "attestation_id": pledge_canon.bond.attestation_id,
                "min_sats": pledge_canon.bond.min_sats,
                "min_days": pledge_canon.bond.min_days,
            },
            "counterparty": pledge_canon.counterparty,
            "dispute": {
                "mechanism": pledge_canon.dispute.mechanism,
                "params": pledge_canon.dispute.params,
            },
            "remediation": "breach_recorded",
            "sworn_at": pledge_canon.sworn_at,
            "nonce": pledge_canon.nonce,
            "sig": {"alg": "bip322", "pubkey": pledge_canon.swearer, "value": "AAAA"},
        }

        def outcome_from(d: dict[str, Any]) -> dict[str, Any]:
            return {"v": 1, "kind": "pledge-outcome", "id": "0" * 64, **d, "sig": None}

        many = inputs.get("outcome_envelopes")
        outcome_ds = many if many is not None else [inputs.get("outcome_envelope")]
        outcome_envs = [outcome_from(d) for d in outcome_ds if d is not None]

        abandonment_d = inputs.get("abandonment_envelope")
        abandonment_env = (
            None
            if abandonment_d is None
            else {
                "v": 1,
                "kind": "pledge-abandonment",
                "id": compute_abandonment_id(abandonment_input_from_dict(abandonment_d)),
                **abandonment_d,
                "sig": {"alg": "bip322", "pubkey": pledge_canon.swearer, "value": "AAAA"},
            }
        )
        # §11.10: only an abandonment that verifies against this pledge enters §4.4.
        if abandonment_env is not None and not verify_abandonment(
            abandonment_env, skip_signature_verification=True, pledge=pledge_canon
        ).ok:
            abandonment_env = None

        chain_height = inputs.get("chain_height")
        chain = None
        if chain_height is not None:
            from orangecheck.pledge.state import ChainState

            chain = ChainState(tip_height=int(chain_height), tip_time=inputs["now"])

        def classify(envs: list[dict[str, Any]]) -> str:
            return classify_state(
                pledge=pledge,
                outcome=envs[0] if envs else None,
                abandonment=abandonment_env,
                now=inputs["now"],
                chain=chain,
                contradictory_outcomes=envs[1:],
            )

        state = classify(outcome_envs)
        # The order outcomes arrive in does not change the state (§4.4).
        assert classify(outcome_envs[::-1]) == state

    assert state == expected_state


def _synthetic_pledge(pledge_id: str, expires_at: str) -> dict[str, Any]:
    return {
        "v": 1,
        "kind": "pledge",
        "id": pledge_id,
        "swearer": {"address": "bc1qsynthetic", "alg": "bip322"},
        "proposition": "synthetic",
        "resolution": {"mechanism": "chain_state", "query": "synthetic"},
        "resolves_at": {"time": "2099-01-01T00:00:00Z"},
        "expires_at": expires_at,
        "bond": {"attestation_id": "0" * 64, "min_sats": 0, "min_days": 0},
        "counterparty": None,
        "dispute": {"mechanism": None, "params": None},
        "remediation": "breach_recorded",
        "sworn_at": "2026-01-01T00:00:00Z",
        "nonce": "0" * 32,
        "sig": {"alg": "bip322", "pubkey": "bc1qsynthetic", "value": "AAAA"},
    }


def _outcome_stub(pledge_id: str, outcome: str, resolved_at: str) -> dict[str, Any]:
    return {
        "v": 1,
        "kind": "pledge-outcome",
        "id": "0" * 64,
        "pledge_id": pledge_id,
        "outcome": outcome,
        "resolved_at": resolved_at,
        "resolved_by": "deterministic",
        "evidence": {"mechanism": "chain_state", "result": "synthetic", "witness": "synthetic"},
        # The shorthand names no window; its outcomes meet inside one (§4.4).
        "dispute_window_ends_at": "2099-01-01T00:00:00Z",
        "sig": None,
    }


# ─── Shape B — delegation scope check (v46) ────────────────────────────────


def _run_scope_check(vec: dict[str, Any]) -> None:
    cases = vec["inputs"]["cases"]
    expected = vec["expected"]["cases"]
    assert len(cases) == len(expected)
    for c, want in zip(cases, expected):
        r = check_pledge_create_scope(
            c["pledge"],
            DelegationLookupResult(
                principal="bc1qprincipal",
                agent="bc1qagent",
                scopes=tuple(c["scopes"]),
                expires_at="2027-01-01T00:00:00Z",
            ),
        )
        got = (
            {"ok": True, "matched_scope": r.matched_scope}
            if r.ok
            else {"ok": False, "code": r.code}
        )
        assert got == want, c["note"]


# ─── Shape C — malformed-input (v28, v33, v41-v45) ─────────────────────────


def _run_malformed(vec: dict[str, Any]) -> None:
    inputs = vec["inputs"]
    expected_error = vec["expected"]["error"]

    # v41: an outcome envelope that verification MUST refuse, and its twin with
    # the same bytes that verifies.
    if "outcome_envelope" in inputs:
        r = verify_outcome(
            inputs["outcome_envelope"],
            skip_signature_verification=True,
            skip_resolver_authorization=True,
        )
        assert not r.ok
        assert r.code == expected_error
        twin = inputs.get("twin")
        if twin is not None:
            assert twin["id"] == inputs["outcome_envelope"]["id"]
            t = verify_outcome(
                twin, skip_signature_verification=True, skip_resolver_authorization=True
            )
            assert t.ok == vec["expected"]["twin_verifies"]
        return

    # v33, v42-v44: a whole envelope that verification MUST refuse, and for
    # v42/v43 its twin with the same bytes that verifies.
    if "envelope" in inputs:
        r = verify_pledge(
            inputs["envelope"],
            skip_signature_verification=True,
            skip_delegation_verification=True,
        )
        assert not r.ok
        assert r.code == expected_error
        twin = inputs.get("twin")
        if twin is not None:
            assert twin["id"] == inputs["envelope"]["id"]
            t = verify_pledge(
                twin, skip_signature_verification=True, skip_delegation_verification=True
            )
            assert t.ok == vec["expected"]["twin_verifies"]
        return

    class _NoopSigner:
        def __init__(self, address: str) -> None:
            self.address = address

        def sign_message(self, msg: str) -> str:  # pragma: no cover - never reached
            return "NEVER_REACHED"

    with pytest.raises(PledgeError) as excinfo:
        create_pledge(
            swearer=inputs["swearer"],
            proposition=inputs["proposition"],
            resolution=inputs["resolution"],
            resolves_at=inputs["resolves_at"],
            expires_at=inputs["expires_at"],
            bond=inputs["bond"],
            counterparty=inputs.get("counterparty"),
            dispute=inputs["dispute"],
            sworn_at=inputs["sworn_at"],
            nonce=inputs["nonce"],
            swearer_signer=_NoopSigner(inputs["swearer"]),
        )
    assert excinfo.value.code == expected_error
