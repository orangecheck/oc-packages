"""
Conformance tests — Python SDK must agree with the normative vectors
at github.com/orangecheck/oc-protocol/tree/main/conformance/vectors.

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


# ─── bip322_signature — skipped for now in Python ─────────────────────────
#
# These vectors need a real BIP-322 verifier. The TypeScript SDK has one
# via `bip322-js`; Python doesn't ship with a comparable library. Rather
# than call the hosted API (which would make the conformance suite require
# network), we skip these and document the gap. When a pure-Python
# BIP-322 lib lands, wire it in here.


@pytest.mark.parametrize(
    "vector", vectors_of("bip322_signature"), ids=ids_for("bip322_signature")
)
def test_bip322_signature_deferred(vector: dict) -> None:  # noqa: ARG001
    pytest.skip(
        "BIP-322 signature verification is deferred in the Python SDK until a "
        "pure-Python verifier is available. The TS SDK exercises these vectors "
        "end-to-end; until Python has a local verifier, integrators needing "
        "signature verification from Python should call the hosted API."
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
    }
    assert len(VECTORS) >= 23
