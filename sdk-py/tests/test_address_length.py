"""
Inputs at and past the longest address, read as @orangecheck/bip322 reads
them, held to ``bip322/test-vectors/address-length.json``, which bip322's
own tests read too. A longer input is refused before it is decoded.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from orangecheck.address import decode_address, normalize_address

VECTORS = json.loads(
    (Path(__file__).resolve().parents[2] / "bip322" / "test-vectors" / "address-length.json").read_text()
)["cases"]


def _text(i: object) -> str:
    if isinstance(i, str):
        return i
    assert isinstance(i, dict)
    return i.get("prefix", "") + i["repeat"] * i["count"] + i.get("suffix", "")


def _label(case: dict) -> str:
    i = case["input"]
    return i if isinstance(i, str) else f"{i['count']}x{i['repeat']}"


@pytest.mark.parametrize("case", VECTORS, ids=_label)
def test_vector(case: dict) -> None:
    text = _text(case["input"])
    assert (decode_address(text) is not None) is case["address"]
    assert normalize_address(text) == case["normalized"]


def test_long_input_costs_no_more_than_a_short_one() -> None:
    for case in VECTORS:
        if isinstance(case["input"], str) or case["input"]["count"] < 8000:
            continue
        text = _text(case["input"])
        started = time.perf_counter()
        assert decode_address(text) is None
        assert normalize_address(text) is None
        assert time.perf_counter() - started < 0.25, case["input"]
