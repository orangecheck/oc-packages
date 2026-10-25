"""
SPEC §0: digits are ASCII 0-9, and whitespace is what JavaScript's ``\\s`` and
``trim()`` take. ``pledge-core/test-vectors/text-classes.json`` pins both, with
JSON integers, and pledge-core's text-classes.test.ts gives the same answers.
"""

from __future__ import annotations

import json
import re
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from orangecheck._text import JS_WHITESPACE, NOT_WS, WS, js_strip
from orangecheck.pledge import (
    DelegationLookupResult,
    check_pledge_create_scope,
    pledge_input_from_dict,
    validate_pledge_input,
    validate_resolution_query,
)
from orangecheck.pledge.resolution import _js

VECTORS_PATH = (
    Path(__file__).resolve().parents[3] / "pledge-core" / "test-vectors" / "text-classes.json"
)
V: dict[str, Any] = json.loads(VECTORS_PATH.read_text())

COUNTERPARTY = "bc1qcounter0000000000000000000000000000000"
PLEDGE_DICT: dict[str, Any] = {
    "swearer": "bc1qswearer00000000000000000000000000000000",
    "proposition": "I will deliver the audit report to the counterparty.",
    "resolution": {
        "mechanism": "counterparty_signs",
        "query": f"counterparty({COUNTERPARTY}) signs outcome over pledge_id",
    },
    "resolves_at": {"time": "2027-01-01T00:00:00Z"},
    "expires_at": "2027-02-01T00:00:00Z",
    "bond": {"attestation_id": "c" * 64, "min_sats": 1000, "min_days": 1},
    "counterparty": COUNTERPARTY,
    "dispute": {"mechanism": None, "params": None},
    "remediation": "breach_recorded",
    "sworn_at": "2026-10-20T00:00:00Z",
    "nonce": "0123456789abcdef0123456789abcdef",
}
PLEDGE = pledge_input_from_dict(PLEDGE_DICT)

_CODE_POINTS = [cp for cp in range(0x110000) if not 0xD800 <= cp <= 0xDFFF]


def test_whitespace_is_the_listed_code_points() -> None:
    listed = set(V["whitespace"])
    assert sorted(ord(c) for c in JS_WHITESPACE) == sorted(listed)
    ws, not_ws = re.compile(WS), re.compile(NOT_WS)
    for cp in _CODE_POINTS:
        ch = chr(cp)
        inside = cp in listed
        assert (ws.fullmatch(ch) is not None) == inside, hex(cp)
        assert (not_ws.fullmatch(ch) is not None) == (not inside), hex(cp)
        assert (js_strip(ch) == "") == inside, hex(cp)
    assert not listed & set(V["not_whitespace"])


def test_only_ascii_digits_are_digits() -> None:
    digit = re.compile(_js(r"\d"))
    matched = "".join(chr(cp) for cp in _CODE_POINTS if digit.fullmatch(chr(cp)))
    assert matched == V["digits"]
    assert all(chr(cp) not in matched for cp in V["not_digits"])


@pytest.mark.parametrize("case", V["resolution_queries"])
def test_resolution_query(case: dict[str, Any]) -> None:
    assert validate_resolution_query(case["mechanism"], case["query"]).ok is case["ok"]


@pytest.mark.parametrize("case", V["times"])
def test_time(case: dict[str, Any]) -> None:
    assert validate_pledge_input(replace(PLEDGE, sworn_at=case["value"])).ok is case["ok"]


@pytest.mark.parametrize("case", V["counts"])
def test_count(case: dict[str, Any]) -> None:
    d = json.loads(json.dumps(PLEDGE_DICT))
    if case["field"] == "block":
        d["resolves_at"] = {"block": case["value"]}
    else:
        d["bond"][case["field"]] = case["value"]
    assert validate_pledge_input(pledge_input_from_dict(d)).ok is case["ok"]


@pytest.mark.parametrize("case", V["scopes"]["cases"])
def test_delegation_scope(case: dict[str, Any]) -> None:
    delegation = DelegationLookupResult(
        principal="bc1qprincipal",
        agent="bc1qagent",
        scopes=(case["scope"],),
        expires_at="2027-01-01T00:00:00Z",
    )
    pledge = {"bond": {"min_sats": V["scopes"]["min_sats"]}}
    assert check_pledge_create_scope(pledge, delegation).ok is case["ok"]
