"""
A P2WPKH or P2SH-P2WPKH simple signature verifies only with the key its
address commits to. verify_sig checks that itself, so these cases stub the
bridge to succeed: the verdict must not depend on the installed bip322.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import List

import pytest

vs = pytest.importorskip("orangecheck.verify_sig")

CORPUS = json.loads((Path(__file__).parent / "fixtures" / "bip322-js-6.1.8.json").read_text())
GOOD_P2SH = next(c for c in CORPUS if c["label"] == "good-p2sh" and c["expect"])
GOOD_P2WPKH = next(
    c
    for c in CORPUS
    if c["address"].startswith("bc1q")
    and len(c["address"]) == 42
    and c["expect"]
    and len(base64.b64decode(c["signature"] + "=" * (-len(c["signature"]) % 4))) != 65
)
# The compressed secp256k1 generator: a valid key that no corpus address commits to.
OTHER_KEY = bytes.fromhex("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798")


def stack(case: dict) -> List[bytes]:
    sig = base64.b64decode(case["signature"])
    items = vs._witness_stack(sig)
    assert items is not None and len(items) == 2
    return items


def encode(items: List[bytes]) -> str:
    out = bytes([len(items)]) + b"".join(bytes([len(x)]) + x for x in items)
    return base64.b64encode(out).decode("ascii")


@pytest.fixture
def bridge_says_yes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(vs._bip322, "verify_simple_encoded", lambda *a: None)


@pytest.mark.parametrize("case", [GOOD_P2SH, GOOD_P2WPKH], ids=["p2sh", "p2wpkh"])
def test_the_real_key_verifies(case: dict) -> None:
    assert vs.verify_bip322_signature(case["address"], case["message"], case["signature"])


@pytest.mark.parametrize("case", [GOOD_P2SH, GOOD_P2WPKH], ids=["p2sh", "p2wpkh"])
def test_another_key_is_refused_whatever_the_bridge_says(case: dict, bridge_says_yes: None) -> None:
    sig, key = stack(case)
    assert vs.verify_bip322_signature(case["address"], case["message"], encode([sig, key]))
    assert not vs.verify_bip322_signature(case["address"], case["message"], encode([sig, OTHER_KEY]))


@pytest.mark.parametrize(
    "items",
    [
        [],
        [b"\x30" * 71],
        [b"\x30" * 71, b"\x04" + b"\x11" * 64],
        [b"\x30" * 71, OTHER_KEY, b"\x51"],
    ],
    ids=["empty", "no-key", "uncompressed", "three-items"],
)
def test_a_key_hash_witness_of_another_shape_is_refused(items: List[bytes], bridge_says_yes: None) -> None:
    assert not vs.verify_bip322_signature(GOOD_P2SH["address"], GOOD_P2SH["message"], encode(items))


def test_an_empty_taproot_witness_is_refused(bridge_says_yes: None) -> None:
    taproot = next(c for c in CORPUS if c["address"].startswith("bc1p"))
    assert not vs.verify_bip322_signature(taproot["address"], taproot["message"], encode([]))


def test_a_stack_with_bytes_left_over_is_refused(bridge_says_yes: None) -> None:
    sig = base64.b64decode(GOOD_P2SH["signature"]) + b"\x00"
    assert not vs.verify_bip322_signature(
        GOOD_P2SH["address"], GOOD_P2SH["message"], base64.b64encode(sig).decode("ascii")
    )


def test_a_bridge_panic_is_false(monkeypatch: pytest.MonkeyPatch) -> None:
    class PanicException(BaseException):
        pass

    def panic(*a: object) -> None:
        raise PanicException("index out of range")

    monkeypatch.setattr(vs._bip322, "verify_simple_encoded", panic)
    assert not vs.verify_bip322_signature(
        GOOD_P2SH["address"], GOOD_P2SH["message"], GOOD_P2SH["signature"]
    )


def test_an_interrupt_still_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    def interrupt(*a: object) -> None:
        raise KeyboardInterrupt

    monkeypatch.setattr(vs._bip322, "verify_simple_encoded", interrupt)
    with pytest.raises(KeyboardInterrupt):
        vs.verify_bip322_signature(GOOD_P2SH["address"], GOOD_P2SH["message"], GOOD_P2SH["signature"])
