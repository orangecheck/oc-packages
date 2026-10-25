"""
did:oc and email rules, held to auth-core's vectors.

``auth-core/test-vectors/identifiers.json`` is read here and by auth-core's
``src/__tests__/identifiers.test.ts``, so a Python site and a Node site agree
on what a did:oc is and on the form an email is looked up in.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from orangecheck import is_did_oc, normalize_email

VECTORS = json.loads(
    (
        Path(__file__).resolve().parents[2] / "auth-core" / "test-vectors" / "identifiers.json"
    ).read_text()
)


@pytest.mark.parametrize("did", VECTORS["did_oc"]["valid"])
def test_accepts_a_did_oc(did):
    assert is_did_oc(did) is True


@pytest.mark.parametrize("value", VECTORS["did_oc"]["invalid"])
def test_refuses_anything_else(value):
    assert is_did_oc(value) is False


def test_refuses_anything_that_is_not_a_str():
    did = VECTORS["did_oc"]["valid"][0]

    class PrintsAsADid:
        def __str__(self):
            return did

    for value in [None, 42, [did], did.encode(), {"did": did}, PrintsAsADid()]:
        assert is_did_oc(value) is False


@pytest.mark.parametrize("case", VECTORS["email"], ids=lambda c: repr(c["in"])[:40])
def test_normalizes_an_email(case):
    assert normalize_email(case["in"]) == case["out"]
    assert normalize_email(normalize_email(case["in"])) == case["out"]
