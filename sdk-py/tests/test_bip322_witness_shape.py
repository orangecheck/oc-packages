"""
A BIP-322 simple witness is the whole signature, written as a transaction's (OC Attest SPEC §4):
the same answers as @orangecheck/bip322 for each shape around the finalized BIP's own vectors.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest

from orangecheck import verify_bip322_signature

BASIC = json.loads((Path(__file__).parent / "fixtures" / "bip322-official-basic.json").read_text())
P2WPKH = next(v for v in BASIC["simple"] if v["type"] == "p2wpkh" and v["message"] == "Hello World")
P2TR = next(v for v in BASIC["simple"] if v["type"] == "p2tr")

pytestmark = pytest.mark.skipif(
    verify_bip322_signature is None, reason="install orangecheck[verify] to run BIP-322 vectors"
)


def _witness(vector: dict) -> bytes:
    return base64.b64decode(vector["bip322_signatures"][0].removeprefix("smp"))


def _items(blob: bytes) -> list[bytes]:
    items, at = [], 1
    for _ in range(blob[0]):
        items.append(blob[at + 1 : at + 1 + blob[at]])
        at += 1 + blob[at]
    assert at == len(blob)
    return items


def _stack(*items: bytes) -> bytes:
    return bytes([len(items)]) + b"".join(bytes([len(i)]) + i for i in items)


def _verifies(vector: dict, blob: bytes) -> bool:
    return verify_bip322_signature(
        vector["address"], vector["message"], base64.b64encode(blob).decode()
    )


def test_the_unchanged_witnesses_verify() -> None:
    assert _verifies(P2WPKH, _witness(P2WPKH))
    assert _verifies(P2TR, _witness(P2TR))


@pytest.mark.parametrize("vector", [P2WPKH, P2TR], ids=lambda v: v["type"])
def test_a_byte_after_the_stack_is_refused(vector: dict) -> None:
    assert not _verifies(vector, _witness(vector) + b"\x00")


@pytest.mark.parametrize("vector", [P2WPKH, P2TR], ids=lambda v: v["type"])
def test_a_size_that_is_not_a_minimal_compact_size_is_refused(vector: dict) -> None:
    blob = _witness(vector)
    long_count = b"\xfd" + bytes([blob[0], 0]) + blob[1:]
    long_length = blob[:1] + b"\xfd" + bytes([blob[1], 0]) + blob[2:]
    assert not _verifies(vector, long_count)
    assert not _verifies(vector, long_length)


def test_p2wpkh_takes_exactly_a_signature_and_a_compressed_key() -> None:
    sig, key = _items(_witness(P2WPKH))
    assert _verifies(P2WPKH, _stack(sig, key))
    assert not _verifies(P2WPKH, _stack(sig, key, b""))
    assert not _verifies(P2WPKH, _stack(sig))
    assert not _verifies(P2WPKH, _stack(sig, b"\x04" + key[1:]))


def test_p2tr_takes_exactly_one_key_path_signature() -> None:
    (sig,) = _items(_witness(P2TR))
    assert len(sig) == 64
    assert not _verifies(P2TR, _stack(sig + b"\x00"))
    assert not _verifies(P2TR, _stack(sig, b"\x50"))
    assert not _verifies(P2TR, _stack(sig, b""))


@pytest.mark.parametrize("vector", [P2WPKH, P2TR], ids=lambda v: v["type"])
def test_the_witness_parser_itself_refuses_a_size_that_is_not_minimal(vector: dict) -> None:
    # bip322 refuses these too; this holds the check here to it whatever version is installed.
    from orangecheck.verify_sig import _witness_stack

    blob = _witness(vector)
    assert _witness_stack(blob) is not None
    assert _witness_stack(b"\xfd" + bytes([blob[0], 0]) + blob[1:]) is None
    assert _witness_stack(blob[:1] + b"\xfd" + bytes([blob[1], 0]) + blob[2:]) is None


def test_a_simple_signature_on_p2wsh_is_refused_whatever_the_bridge_says(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from orangecheck import verify_sig

    monkeypatch.setattr(verify_sig._bip322, "verify_simple_encoded", lambda *a: None)
    # BIP-173's P2WSH example. Only P2WPKH, P2SH-P2WPKH and P2TR have a simple form here.
    p2wsh = "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3"
    signature = P2WPKH["bip322_signatures"][0]
    assert verify_bip322_signature(P2WPKH["address"], P2WPKH["message"], signature)
    assert not verify_bip322_signature(p2wsh, P2WPKH["message"], signature)
