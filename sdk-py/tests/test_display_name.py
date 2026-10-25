"""
The family name rule, held to auth-core's vectors.

``auth-core/test-vectors/display-name.json`` is read here and by auth-core's
``src/__tests__/display-name.test.ts``, so a Python site and a Node site refuse
the same names and allow orangecheck its own.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from orangecheck import is_reserved_name, name_problem

VECTORS = json.loads(
    (
        Path(__file__).resolve().parents[2] / "auth-core" / "test-vectors" / "display-name.json"
    ).read_text(encoding="utf-8")
)


@pytest.mark.parametrize("name", VECTORS["reserved"] + VECTORS["confusable"])
def test_refuses_our_names_however_drawn(name):
    assert is_reserved_name(name) is True
    assert name_problem(name, 80) == "reserved"


@pytest.mark.parametrize("name", VECTORS["allowed"])
def test_allows_a_name_that_only_resembles_ours(name):
    assert name_problem(name, 80) is None


@pytest.mark.parametrize("name", VECTORS["hidden"])
def test_refuses_what_hides_or_reorders_text(name):
    assert name_problem(name, 80) == "hidden_characters"


def test_refuses_a_lone_surrogate_and_the_unassigned_tag_code_points():
    assert name_problem("Lumen\ud800Notes", 80) == "hidden_characters"
    for cp in (0xE0000, 0xE0080, 0xE00FF, 0xE01F0, 0xE0FFF):
        assert name_problem(f"Lumen{chr(cp)}Notes", 80) == "hidden_characters", hex(cp)


@pytest.mark.parametrize("case", VECTORS["lengths"], ids=lambda c: f"{len(c['name'])}/{c['max']}")
def test_counts_length_in_code_points(case):
    assert name_problem(case["name"], case["max"]) == case["problem"]


@pytest.mark.parametrize("case", VECTORS["allow_reserved"], ids=lambda c: repr(c["name"]))
def test_allows_orangecheck_its_own_names_and_nothing_else(case):
    assert name_problem(case["name"], case["max"], allow_reserved=True) == case["problem"]


@pytest.mark.parametrize("name", VECTORS["reserved"] + VECTORS["confusable"])
def test_allow_reserved_lifts_only_the_reserved_check(name):
    assert is_reserved_name(name, allow_reserved=True) is False
    assert name_problem(name, 80, allow_reserved=True) is None
    assert name_problem(name, 80, allow_reserved=False) == "reserved"


def test_refuses_an_option_it_does_not_read_or_one_that_is_not_a_bool():
    with pytest.raises(TypeError):
        name_problem("ochk", 80, allowReserved=True)  # type: ignore[call-arg]
    with pytest.raises(TypeError, match="True or False"):
        name_problem("ochk", 80, allow_reserved="yes")  # type: ignore[arg-type]
    with pytest.raises(TypeError, match="True or False"):
        is_reserved_name("ochk", allow_reserved=1)  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        name_problem(None, 80)  # type: ignore[arg-type]


def test_a_bad_option_is_refused_before_the_name_is_read():
    with pytest.raises(TypeError, match="True or False"):
        name_problem("", 80, allow_reserved="yes")  # type: ignore[arg-type]


def test_reads_a_long_name_in_time_linear_in_its_length():
    # A capital reads two ways; only the starts of our names are carried forward.
    started = time.monotonic()
    assert is_reserved_name("A" * 22 + "B" * 2000) is False
    assert time.monotonic() - started < 1.0
