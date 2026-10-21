"""
The finalized BIP-322's own vectors (bitcoin/bips bip-0322/*.json at d77863fb9e9b),
the same files @orangecheck/bip322 1.1 tests against: every P2WPKH and P2TR simple
signature verifies with or without its ``smp`` prefix, and every error vector fails.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from orangecheck import verify_bip322_signature

FIXTURES = Path(__file__).parent / "fixtures"
BASIC = json.loads((FIXTURES / "bip322-official-basic.json").read_text())
GENERATED = json.loads((FIXTURES / "bip322-official-generated.json").read_text())

SIGNABLE = [v for v in BASIC["simple"] + GENERATED["simple"] if v["type"] in ("p2wpkh", "p2tr")]
ERRORS = BASIC["error"] + GENERATED["error"]

pytestmark = pytest.mark.skipif(
    verify_bip322_signature is None, reason="install orangecheck[verify] to run BIP-322 vectors"
)


def test_the_vectors_are_the_expected_set() -> None:
    assert len(SIGNABLE) == 5  # 3 P2WPKH, 2 P2TR
    assert len(ERRORS) == 36


@pytest.mark.parametrize("vector", SIGNABLE, ids=lambda v: f"{v['type']}:{v['message'][:16]}")
def test_simple_signatures_verify_prefixed_or_not(vector: dict) -> None:
    for sig in vector["bip322_signatures"]:
        bare = sig[3:] if sig.startswith("smp") else sig
        assert verify_bip322_signature(vector["address"], vector["message"], sig)
        assert verify_bip322_signature(vector["address"], vector["message"], bare)
        assert verify_bip322_signature(vector["address"], vector["message"], "smp" + bare)
        assert not verify_bip322_signature(vector["address"], vector["message"] + "!", sig)


@pytest.mark.parametrize("vector", ERRORS, ids=lambda e: e["description"][:48])
def test_error_vectors_fail(vector: dict) -> None:
    assert not verify_bip322_signature(vector["address"], vector["message"], vector["signature"])


def test_full_and_proof_of_funds_signatures_are_refused() -> None:
    v = SIGNABLE[0]
    bare = v["bip322_signatures"][0].removeprefix("smp")
    assert not verify_bip322_signature(v["address"], v["message"], "ful" + bare)
    assert not verify_bip322_signature(v["address"], v["message"], "pof" + bare)
