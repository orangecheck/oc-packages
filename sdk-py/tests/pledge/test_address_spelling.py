"""
SPEC §2: one spelling per address. A bech32 address is written in lowercase;
discovery tags and every address comparison are by exact string, so the same
key in capitals would go unlisted, or pass as an agent that differs from the
swearer. Vectors v55-v58 pin the verify side; these pin the signer side and the
edges the vectors do not reach, as pledge-core's address-spelling tests do.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

import pytest

from orangecheck.pledge import PledgeError, create_pledge, wrap_pledge_envelope
from orangecheck.pledge.canonical import (
    OutcomeCanonicalInput,
    OutcomeEvidence,
    PledgeBond,
    PledgeCanonicalInput,
    PledgeDispute,
    PledgeResolution,
    ResolvesAtTime,
    ValidateErr,
    ValidateOk,
    read_outcome_input,
    validate_pledge_input,
)

SWEARER = "bc1qalice000000000000000000000000000000000"

CANON = PledgeCanonicalInput(
    swearer=SWEARER,
    proposition="I will ship it.",
    resolution=PledgeResolution(mechanism="chain_state", query="block(900000).exists"),
    resolves_at=ResolvesAtTime(time="2026-06-01T00:00:00Z"),
    expires_at="2026-06-15T00:00:00Z",
    bond=PledgeBond(attestation_id="3" * 64, min_sats=1, min_days=1),
    counterparty=None,
    dispute=PledgeDispute(mechanism=None, params=None),
    remediation="breach_recorded",
    sworn_at="2026-04-20T09:00:00Z",
    nonce="fedcba9876543210fedcba9876543210",
)

OUTCOME = OutcomeCanonicalInput(
    pledge_id="a" * 64,
    outcome="kept",
    resolved_at="2026-06-02T10:00:00Z",
    resolved_by="bc1qcounter0000000000000000000000000000000",
    evidence=OutcomeEvidence(mechanism="counterparty_signs", result="kept", witness="sig"),
    dispute_window_ends_at="2026-06-09T10:00:00Z",
)


class FakeSigner:
    def __init__(self, address: str) -> None:
        self.address = address

    def sign_message(self, msg: str) -> str:
        return "AAAA"


def refused(result: Any, field: str) -> bool:
    return isinstance(result, ValidateErr) and field in result.reason and "lowercase" in result.reason


@pytest.mark.parametrize(
    "swearer",
    [
        SWEARER.upper(),
        "bc1qalicE000000000000000000000000000000000",
        "TB1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KXPJZSX",
        "BCRT1Q50RTRMJ2F8VL9TEM8QPFW36YLW5JG9J2DKKU3W",
    ],
)
def test_a_swearer_in_capitals_is_refused(swearer: str) -> None:
    assert refused(validate_pledge_input(replace(CANON, swearer=swearer)), "swearer")


def test_a_base58_address_is_taken_as_encoded() -> None:
    swearer = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT"
    assert isinstance(validate_pledge_input(replace(CANON, swearer=swearer)), ValidateOk)
    assert isinstance(validate_pledge_input(CANON), ValidateOk)


def test_a_counterparty_in_capitals_is_refused() -> None:
    assert refused(validate_pledge_input(replace(CANON, counterparty=SWEARER.upper())), "counterparty")


def test_a_resolver_in_capitals_is_refused_and_deterministic_still_reads() -> None:
    upper = replace(OUTCOME, resolved_by=OUTCOME.resolved_by.upper())
    assert refused(read_outcome_input(upper), "resolved_by")
    assert isinstance(read_outcome_input(replace(OUTCOME, resolved_by="deterministic")), ValidateOk)
    assert isinstance(read_outcome_input(OUTCOME), ValidateOk)


def test_no_pledge_is_signed_for_an_agent_written_as_the_swearer_in_capitals() -> None:
    terms: dict[str, Any] = dict(
        swearer=SWEARER,
        proposition="I will not spend the bonded UTXO before block 920000.",
        resolution={"mechanism": "chain_state", "query": f"address({SWEARER}).balance >= 500000"},
        resolves_at={"block": 920000},
        expires_at="2026-12-31T00:00:00Z",
        bond={"attestation_id": "1" * 64, "min_sats": 500000, "min_days": 180},
        counterparty=None,
        dispute={"mechanism": None, "params": None},
        sworn_at="2026-04-24T18:30:00Z",
        nonce="0123456789abcdef0123456789abcdef",
    )
    agent = FakeSigner(SWEARER.upper())
    with pytest.raises(PledgeError, match="lowercase") as e:
        create_pledge(**terms, via_delegation={"delegation_id": "d" * 64, "agent_signer": agent})
    assert e.value.code == "E_PLEDGE_MALFORMED"


def test_no_agent_signature_is_wrapped_for_the_swearer_in_capitals() -> None:
    with pytest.raises(PledgeError, match="lowercase"):
        wrap_pledge_envelope(
            CANON,
            "AAAA",
            via_delegation={"delegation_id": "d" * 64, "agent_address": SWEARER.upper()},
        )
