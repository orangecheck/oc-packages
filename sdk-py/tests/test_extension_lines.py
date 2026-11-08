"""
build_canonical_message writes each extension as one line a verifier reads
(SPEC §2.2, §7.1 step 1), as the TS SDK's buildCanonicalMessage does: it
refuses a key or value it cannot write that way.
"""

from __future__ import annotations

import pytest

from orangecheck import build_canonical_message


def build(extensions: dict) -> str:
    return build_canonical_message(
        address="bc1qexample",
        identities=[],
        extensions=extensions,
        nonce="0011223344556677889900aabbccddee",
        issued_at="2026-04-22T12:00:00Z",
    )


@pytest.mark.parametrize(
    "extensions",
    [
        {"aud": "https://a.example\naddress: bc1qother"},
        {"aud": "https://a.example\rnetwork: testnet"},
        {"my key": "x"},
        {"a:b": "x"},
        {"clé": "x"},
        {"address": "bc1qother"},
        {"Nonce": "00"},
    ],
    ids=["newline-value", "cr-value", "space-key", "colon-key", "non-ascii-key", "core-key", "core-key-capitals"],
)
def test_refuses_an_extension_it_cannot_write_as_one_line(extensions: dict) -> None:
    with pytest.raises(ValueError, match="invalid extension"):
        build(extensions)


def test_writes_a_key_given_in_capitals_in_lowercase_and_drops_an_empty_value() -> None:
    msg = build({"AUD": "https://a.example", "expires": ""})
    assert msg.endswith("\naud: https://a.example\n")
    assert "expires:" not in msg


def test_writes_every_printable_key_a_verifier_takes() -> None:
    msg = build({"x-net_2.0~!": "v", "[a]": "w"})
    assert msg.endswith("\n[a]: w\nx-net_2.0~!: v\n")
