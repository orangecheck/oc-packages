"""A BIP-137 signature is 65 bytes (a header and r, s): no other length verifies, as in
@orangecheck/bip322. tv35's legacy P2PKH signatures, with a byte added or taken away."""

import base64
import json
from pathlib import Path

import pytest

from orangecheck import verify_bip322_signature

TV35 = json.loads((Path(__file__).parent / "vectors" / "tv35.json").read_text())
LEGACY_1 = [
    c for c in TV35["input"]["cases"] if c["address"].startswith("1") and c["code"] == "sig_ok_legacy"
]


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


@pytest.mark.skipif(verify_bip322_signature is None, reason="install orangecheck[verify]")
@pytest.mark.parametrize("case", LEGACY_1, ids=[c["name"] for c in LEGACY_1])
def test_only_65_bytes_verify(case: dict) -> None:
    raw = base64.b64decode(case["signature"])
    assert len(raw) == 65
    assert verify_bip322_signature(case["address"], case["message"], case["signature"])
    for other in (raw + b"\x00", raw + raw[-1:], raw[:-1]):
        assert not verify_bip322_signature(case["address"], case["message"], _b64(other)), len(other)


def test_tv35_has_legacy_p2pkh_cases() -> None:
    assert len(LEGACY_1) >= 2
