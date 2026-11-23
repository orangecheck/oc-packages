"""
BOND.md §3 step 4: a bond signature may cover the bond without its final LF,
which is what a wallet that trims the text before signing it signs. No other
text verifies, and the message passed in still needs its LF. The signatures
are OC Attest vector tv37's, over tv25's P2WPKH bond by private key 1.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from orangecheck import verify_bip322_signature, verify_bond_signature

pytestmark = pytest.mark.skipif(
    verify_bip322_signature is None, reason="install orangecheck[verify] to check bond signatures"
)

TV25 = json.loads((Path(__file__).parent / "vectors" / "tv25.json").read_text())
MESSAGE = TV25["input"]["bonds"][0]["message"]
BOND_ID = TV25["expected"]["bond_ids"][0]
NOW = datetime(2026, 10, 16, 12, 5, tzinfo=timezone.utc)

# BIP-322 simple and BIP-137 (header 39 + recovery id), each over MESSAGE without its final LF.
OVER_TRIMMED = [
    "AkgwRQIhAP1qpe4elxOeqrkzzzhPOIjv6ulYxY6Zss/WPuMWeQJXAiBuMAA00/21dyfq3jQa3SkaZrNGuYikChJOCoN40+dnrAEhAnm+Zn753LusVaBilc6HCwcCm/zbLc4o2VnygVsW+BeY",
    "J/XKB0IFf2jypgrh0ph0qAvv4GOgb/O6Ruicx6lZuYXlJPIO0vtBO3+xk4dWpHVvlhrGxiJ9SyXe1CT4R/10xP0=",
]
# BIP-322 simple over MESSAGE with a second LF, and with CRLF in place of its final LF.
OVER_OTHER_TEXTS = [
    "AkgwRQIhALSD7I8dm0z7QPKmmYOEMuM1CD5Gc/kqiN9b8hNr5cMfAiBPfLpynbswvzjAJ2wH3xpMUcOGxUEazdAseK8xzsPvegEhAnm+Zn753LusVaBilc6HCwcCm/zbLc4o2VnygVsW+BeY",
    "AkgwRQIhAP7C+dlwASLM4tI2YSEKMJR4d/baRFE7xu0iUgQpZZP2AiALIG8L8gJ5wRgQWafihmp/GBWHL5zeYXUrxoiaa7NxcQEhAnm+Zn753LusVaBilc6HCwcCm/zbLc4o2VnygVsW+BeY",
]


@pytest.mark.parametrize("signature", OVER_TRIMMED)
def test_a_signature_over_the_bond_without_its_final_lf_verifies(signature: str) -> None:
    assert verify_bip322_signature(TV25["input"]["bonds"][0]["address"], MESSAGE[:-1], signature)
    assert verify_bond_signature(MESSAGE, signature, now=NOW) == (True, BOND_ID)


@pytest.mark.parametrize("signature", OVER_OTHER_TEXTS)
def test_a_signature_over_another_text_is_refused(signature: str) -> None:
    assert verify_bond_signature(MESSAGE, signature, now=NOW) == (False, "sig_invalid")


@pytest.mark.parametrize("signature", OVER_TRIMMED)
def test_the_bond_passed_without_its_final_lf_is_malformed(signature: str) -> None:
    assert verify_bond_signature(MESSAGE[:-1], signature, now=NOW) == (False, "bond_malformed")
