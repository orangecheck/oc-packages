"""
verify_bip322_signature gives @orangecheck/bip322's verdict on every case it
was measured on: the bip322-js corpus that package is held to, and BIP-137
signatures under every header flag, both recovery-id parities and every
address type a legacy signature can stand for (bip137-parity.json, made by
that package from fixed keys). Addresses verify only in canonical spelling.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from orangecheck import verify_bip322_signature
from orangecheck.address import normalize_address

FIXTURES = Path(__file__).parent / "fixtures"
CORPUS = json.loads((FIXTURES / "bip322-js-6.1.8.json").read_text())
BIP137 = json.loads((FIXTURES / "bip137-parity.json").read_text())

pytestmark = pytest.mark.skipif(
    verify_bip322_signature is None, reason="install orangecheck[verify] to run signature vectors"
)


def test_the_bip322_js_corpus() -> None:
    wrong = [
        c["label"]
        for c in CORPUS
        if verify_bip322_signature(c["address"], c["message"], c["signature"]) is not c["expect"]
    ]
    assert wrong == []
    assert sum(c["expect"] for c in CORPUS) > 150


@pytest.mark.parametrize(
    "case", BIP137, ids=lambda c: f"{c['type']}:{c['form']}:h{c['header']}:{len(c['message'])}"
)
def test_bip137_agrees_with_typescript(case: dict) -> None:
    assert verify_bip322_signature(case["address"], case["message"], case["signature"]) is case["expect"]


def test_bip137_covers_every_header_range_and_parity() -> None:
    accepted = {(c["type"], (c["header"] - 27) // 4, c["header"] % 2) for c in BIP137 if c["expect"]}
    types = {"p2pkh", "p2pkh-uncompressed", "p2sh-p2wpkh", "p2wpkh", "p2tr"}
    assert accepted == {(t, r, p) for t in types for r in range(4) for p in range(2)}


def test_uppercase_bech32_verifies_only_once_normalized() -> None:
    for c in BIP137:
        if c["expect"] and c["address"].startswith("bc1"):
            upper = c["address"].upper()
            assert not verify_bip322_signature(upper, c["message"], c["signature"])
            assert verify_bip322_signature(normalize_address(upper) or "", c["message"], c["signature"])


@pytest.mark.parametrize("prefix", ["ful", "pof"])
def test_full_and_proof_of_funds_are_refused(prefix: str) -> None:
    case = next(c for c in BIP137 if c["expect"] and c["type"] == "p2wpkh")
    assert not verify_bip322_signature(case["address"], case["message"], prefix + case["signature"])
