"""
Conformance tests — Python SDK must agree with the normative vectors
at github.com/orangecheck/oc-attest-protocol/tree/main/conformance/vectors.

A failure here means either:
  (a) the spec moved: re-run `node conformance/generate.mjs` in the
      oc-protocol repo and re-vendor the vectors/ directory, OR
  (b) the Python SDK drifted: fix canonical.py.

These are the exact same JSON files the TypeScript SDK consumes. If
both SDKs pass, they produce the same `attestation_id` for the same
canonical input — which is the whole point of "open protocol".
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from orangecheck import (
    attestation_id,
    build_canonical_message,
    format_identities,
    score_v0,
)

VECTORS_DIR = Path(__file__).parent / "vectors"


def load_vectors() -> list[dict]:
    vectors: list[dict] = []
    for path in sorted(VECTORS_DIR.glob("tv*.json")):
        vectors.append(json.loads(path.read_text()))
    return vectors


VECTORS = load_vectors()


def vectors_of(category: str) -> list[dict]:
    return [v for v in VECTORS if v["category"] == category]


def ids_for(category: str) -> list[str]:
    return [v["id"] for v in vectors_of(category)]


# ─── canonical_message ─────────────────────────────────────────────────────


@pytest.mark.parametrize("vector", vectors_of("canonical_message"), ids=ids_for("canonical_message"))
def test_canonical_message(vector: dict) -> None:
    """Byte-for-byte agreement with the spec's canonical form."""
    inp = vector["input"]
    msg = build_canonical_message(
        address=inp["address"],
        identities=inp.get("identities", []),
        extensions=inp.get("extensions", {}),
        nonce=inp["nonce"],
        issued_at=inp["issued_at"],
    )
    assert msg == vector["expected"]["message"]


# ─── identities_format ─────────────────────────────────────────────────────


@pytest.mark.parametrize("vector", vectors_of("identities_format"), ids=ids_for("identities_format"))
def test_identities_format(vector: dict) -> None:
    assert format_identities(vector["input"]["identities"]) == vector["expected"]["formatted"]


# ─── attestation_id ────────────────────────────────────────────────────────


@pytest.mark.parametrize("vector", vectors_of("attestation_id"), ids=ids_for("attestation_id"))
def test_attestation_id(vector: dict) -> None:
    msg = vector["input"]["message"]
    assert attestation_id(msg) == vector["expected"]["attestation_id"]


# ─── score_v0 ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize("vector", vectors_of("score_v0"), ids=ids_for("score_v0"))
def test_score_v0(vector: dict) -> None:
    inp = vector["input"]
    expected = vector["expected"]["score_v0"]
    got = score_v0(inp["sats_bonded"], inp["days_unspent"])
    # Floating-point tolerance to absorb implementation rounding differences,
    # though at 2dp they should be exact.
    assert abs(got - expected) < 0.01, f"expected {expected}, got {got}"


# ─── reject ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("vector", vectors_of("reject"), ids=ids_for("reject"))
def test_reject(vector: dict) -> None:
    inp = vector["input"]
    reason = vector["expected"]["reason_contains"]
    with pytest.raises(ValueError) as exc:
        format_identities(inp["identities"])
    assert re.search(reason, str(exc.value), re.IGNORECASE), (
        f"expected error to mention {reason!r}, got {exc.value!r}"
    )


# ─── bip322_signature — real verification via the `bip322` Rust-backed lib ──


@pytest.mark.parametrize(
    "vector", vectors_of("bip322_signature"), ids=ids_for("bip322_signature")
)
def test_bip322_signature(vector: dict) -> None:
    """
    Real BIP-322 verification via the `bip322` package (Python ↔ Rust
    bridge around the bitcoin + secp256k1 crates). With the `[verify]`
    extra installed, the Python SDK now exercises tv21-tv23 end-to-end
    — matching the TypeScript SDK's coverage exactly.
    """
    from orangecheck import verify_bip322_signature

    if verify_bip322_signature is None:
        pytest.skip("install orangecheck[verify] to exercise BIP-322 vectors")

    inp = vector["input"]
    expected = vector["expected"]["valid"]
    got = verify_bip322_signature(inp["address"], inp["message"], inp["signature"])
    assert got is expected, (
        f"{vector['id']}: expected valid={expected}, got {got} "
        f"(description: {vector['description']})"
    )


# ─── bonds (BOND.md) ───────────────────────────────────────────────────────


@pytest.mark.parametrize("vector", vectors_of("bond_message"), ids=ids_for("bond_message"))
def test_bond_message(vector: dict) -> None:
    """The same eight lines and the same id as the TypeScript SDK."""
    from orangecheck import BondFields, bond_id, build_bond_message, parse_bond_message

    fields = BondFields(**vector["input"])
    msg = build_bond_message(fields)
    assert msg == vector["expected"]["canonical"]
    assert bond_id(msg) == vector["expected"]["bond_id"]
    assert parse_bond_message(msg) == fields


@pytest.mark.parametrize("vector", vectors_of("bond_nullifier"), ids=ids_for("bond_nullifier"))
def test_bond_nullifier(vector: dict) -> None:
    from orangecheck import bond_nullifier

    inp = vector["input"]
    got = [bond_nullifier(a, inp["outpoint"]) for a in inp["audiences"]]
    assert got == vector["expected"]["nullifiers"]


@pytest.mark.parametrize("vector", vectors_of("bond_floors"), ids=ids_for("bond_floors"))
def test_bond_floors(vector: dict) -> None:
    from orangecheck import bond_floors

    got = [bond_floors(c["sats"], c["age_blocks"]) for c in vector["input"]["cases"]]
    assert got == vector["expected"]["floors"]


@pytest.mark.parametrize("vector", vectors_of("bond_signature"), ids=ids_for("bond_signature"))
def test_bond_signature(vector: dict) -> None:
    from datetime import datetime

    from orangecheck import verify_bip322_signature, verify_bond_signature

    if verify_bip322_signature is None:
        pytest.skip("install orangecheck[verify] to exercise bond signature vectors")

    def at(s: str) -> datetime:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))

    inp = vector["input"]
    for i, b in enumerate(inp.get("bonds", [])):
        ok, got = verify_bond_signature(b["message"], b["signature"], now=at(inp["now"]))
        assert ok, got
        assert got == vector["expected"]["bond_ids"][i]
    for c in inp.get("cases", []):
        assert verify_bond_signature(c["message"], c["signature"], now=at(c["now"])) == (
            False,
            c["reason"],
        )


# ─── Cross-impl meta-check ─────────────────────────────────────────────────


def test_vector_set_complete() -> None:
    """Sanity: we have at least one vector in every category the TS SDK
    exercises, so Python and TS are asserting the same shape."""
    categories = {v["category"] for v in VECTORS}
    assert categories == {
        "canonical_message",
        "identities_format",
        "attestation_id",
        "score_v0",
        "reject",
        "bip322_signature",
        "bond_message",
        "bond_signature",
        "bond_nullifier",
        "bond_floors",
    }
    assert len(VECTORS) >= 28
