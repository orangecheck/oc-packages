"""
BOND.md §2 fields are ASCII, read as auth-core reads them: a field with a
trailing line break, or a time in other digits, is not a bond field.
"""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import pytest

from orangecheck import BondFields, build_bond_message, parse_bond_message

TV24 = json.loads((Path(__file__).parent / "vectors" / "tv24.json").read_text())
FIELDS = BondFields(**TV24["input"])


def _arabic(s: str) -> str:
    return "".join(chr(0x0660 + int(c)) if c.isascii() and c.isdigit() else c for c in s)


def test_the_vector_builds() -> None:
    assert build_bond_message(FIELDS) == TV24["expected"]["canonical"]


@pytest.mark.parametrize("field", ["outpoint", "nonce", "subject", "issued_at", "expires_at"])
def test_a_trailing_line_break_is_refused(field: str) -> None:
    with pytest.raises(ValueError):
        build_bond_message(replace(FIELDS, **{field: getattr(FIELDS, field) + "\n"}))


@pytest.mark.parametrize("field", ["issued_at", "expires_at"])
def test_a_time_in_other_digits_is_refused(field: str) -> None:
    message = TV24["expected"]["canonical"]
    value = getattr(FIELDS, field)
    other = message.replace(f"{field}: {value}\n", f"{field}: {_arabic(value)}\n")
    assert other != message
    assert parse_bond_message(other) is None
