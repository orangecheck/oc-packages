"""
A bond's address is read the way @orangecheck/bip322's decodeAddress reads it,
checksum included, so both SDKs give the same reason for the same message.
The verdicts below were produced by that function.
"""

from __future__ import annotations

import pytest

from orangecheck.bond import _address_ok

TS_VERDICTS = [
    ("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", True),
    ("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5", False),
    ("BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4", False),
    ("bc1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5sspknck9", True),
    ("bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3", True),
    ("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", True),
    ("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", True),
    ("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3", False),
    ("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", True),
    # Valid checksums over bad padding (v0 and v1).
    ("bc1qlllllllllllllllllllllllllllllllllp3sej9", False),
    ("bc1plllllllllllllllllllllllllllllllllllllllllllllllllllllnjr3m8", False),
    # bech32m on a v0 program, and witness version 2.
    ("bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqs9wcxj", False),
    ("bc1zqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqupf6cj", False),
]


@pytest.mark.parametrize("address,ok", TS_VERDICTS)
def test_address_agrees_with_typescript(address: str, ok: bool) -> None:
    assert _address_ok(address) is ok
