"""
The return path after signing in, held to me-client's vectors.

``me-client/test-vectors/return-path.json`` is read here and by me-client's
``src/__tests__/return-path.test.ts``, so a Python site and a Node site send
someone back to the same place.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from orangecheck import safe_return_path

VECTORS = json.loads(
    (Path(__file__).resolve().parents[2] / "me-client" / "test-vectors" / "return-path.json").read_text()
)


@pytest.mark.parametrize("raw", VECTORS["refused"])
def test_answers_the_fallback(raw):
    assert safe_return_path(raw, VECTORS["fallback"]) == VECTORS["fallback"]
    assert safe_return_path(raw, "/account") == "/account"


@pytest.mark.parametrize("case", VECTORS["kept"], ids=lambda c: c["in"])
def test_keeps_a_path_on_the_site(case):
    assert safe_return_path(case["in"], VECTORS["fallback"]) == case["out"]


@pytest.mark.parametrize("raw", [None, 42, ["/account"], b"/account"])
def test_answers_the_fallback_for_anything_that_is_not_text(raw):
    assert safe_return_path(raw) == "/"
