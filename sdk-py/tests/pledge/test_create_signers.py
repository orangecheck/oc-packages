"""create_pledge: who signs. A direct pledge needs the swearer's signer; an agent
pledge needs only the agent's, the principal being the ``swearer`` address."""

from __future__ import annotations

from typing import Any

import pytest

from orangecheck.pledge import PledgeError, create_pledge

SWEARER = "bc1qalice000000000000000000000000000000000"
AGENT = "bc1qagent0000000000000000000000000000000000"
OTHER = "bc1qsomeoneelse00000000000000000000000000"


class FakeSigner:
    def __init__(self, address: str) -> None:
        self.address = address
        self.calls: list[str] = []

    def sign_message(self, msg: str) -> str:
        self.calls.append(msg)
        return "AAAA"


TERMS: dict[str, Any] = dict(
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


def via(agent: FakeSigner) -> dict[str, Any]:
    return {"delegation_id": "d" * 64, "agent_signer": agent}


def test_agent_pledge_needs_no_principal_signer() -> None:
    agent = FakeSigner(AGENT)
    env = create_pledge(**TERMS, via_delegation=via(agent))
    assert env["swearer"]["address"] == SWEARER
    assert env["agent_address"] == AGENT
    assert env["sig"]["pubkey"] == AGENT
    assert agent.calls == [env["id"]]


def test_agent_that_is_the_swearer_is_refused() -> None:
    with pytest.raises(PledgeError) as e:
        create_pledge(**TERMS, via_delegation=via(FakeSigner(SWEARER)))
    assert e.value.code == "E_PLEDGE_MALFORMED"


def test_principal_signer_on_the_agent_path_must_be_the_swearer() -> None:
    agent = FakeSigner(AGENT)
    with pytest.raises(PledgeError) as e:
        create_pledge(**TERMS, swearer_signer=FakeSigner(OTHER), via_delegation=via(agent))
    assert e.value.code == "E_PLEDGE_MALFORMED"
    assert agent.calls == []


def test_direct_pledge_without_a_signer_is_refused() -> None:
    with pytest.raises(PledgeError) as e:
        create_pledge(**TERMS)
    assert e.value.code == "E_PLEDGE_MALFORMED"


def test_direct_pledge_signed_by_anyone_but_the_swearer_is_refused_before_signing() -> None:
    other = FakeSigner(OTHER)
    with pytest.raises(PledgeError) as e:
        create_pledge(**TERMS, swearer_signer=other)
    assert e.value.code == "E_PLEDGE_MALFORMED"
    assert other.calls == []


def test_direct_pledge_by_the_swearer_still_signs() -> None:
    me = FakeSigner(SWEARER)
    env = create_pledge(**TERMS, swearer_signer=me)
    assert env["sig"]["pubkey"] == SWEARER
    assert "via_delegation" not in env
    assert me.calls == [env["id"]]
