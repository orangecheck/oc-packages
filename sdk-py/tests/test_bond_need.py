"""
Bond floors (``require_bond``) as auth-core's ``readBondNeed`` and ``bondMeets``
read them, held to ``auth-core/test-vectors/bond-need.json``, which auth-core's
and me-client's tests read too. A floor that is not one raises TypeError and is
never met.
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Any

import pytest

from orangecheck import bond_meets, check_oc_session, verify_session
from orangecheck.integrator import _need_from

V: dict[str, Any] = json.loads(
    (Path(__file__).resolve().parents[2] / "auth-core" / "test-vectors" / "bond-need.json").read_text()
)
SPECIAL = {"NaN": math.nan, "Infinity": math.inf}


def _value(v: Any) -> Any:
    return SPECIAL[v["$number"]] if isinstance(v, dict) and "$number" in v else v


def _need(case: dict[str, Any]) -> dict[str, Any]:
    return {k: _value(v) for k, v in case["need"].items()}


CLAIMS = {
    "oc_bond": {
        "v": 1,
        "sats_floor": V["claim"]["sats_floor"],
        "days_floor": V["claim"]["days_floor"],
        "height": 971_800,
        "checked_at": math.floor(time.time()) - V["claim"]["checked_ago_secs"],
        "nullifier": "ab" * 32,
    }
}


@pytest.mark.parametrize("case", V["cases"], ids=lambda c: json.dumps(c["need"]))
def test_bond_need(case: dict[str, Any]) -> None:
    need = _need(case)
    if case["valid"]:
        assert bond_meets(CLAIMS, **_need_from(need)) is case["meets"]
    else:
        with pytest.raises(TypeError):
            _need_from(need)
    # bond_meets takes the floors as keywords; max_age_secs=None is its "no limit" default.
    if set(need) <= {"min_sats", "min_days", "max_age_secs"} and need.get("max_age_secs", 0) is not None:
        assert bond_meets(CLAIMS, **need) is case["meets"]


def test_a_bad_floor_raises_before_the_token_is_read() -> None:
    bad = {"min_sats": math.nan}
    with pytest.raises(TypeError):
        verify_session("not.a.token", "https://your-site.example", require_bond=bad)
    with pytest.raises(TypeError):
        check_oc_session(None, "https://your-site.example", jwks={"keys": []}, require_bond=bad)
    with pytest.raises(TypeError):
        _need_from([("min_sats", 1000)])
