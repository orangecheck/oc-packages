"""
Addresses are read the way @orangecheck/bip322's decodeAddress reads them,
checksum included, so both SDKs give the same answer for the same input.
The verdicts below were produced by that function.
"""

from __future__ import annotations

import pytest

from orangecheck.address import decode_address, normalize_address

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
    assert (decode_address(address) is not None) is ok


@pytest.mark.parametrize(
    "address,kind,network",
    [
        ("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "p2wpkh", "mainnet"),
        ("bc1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5sspknck9", "p2tr", "mainnet"),
        ("bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3", "p2wsh", "mainnet"),
        ("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", "p2pkh", "mainnet"),
        ("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", "p2sh", "mainnet"),
        ("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", "p2wpkh", "testnet"),
        ("mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn", "p2pkh", "testnet"),
        ("2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc", "p2sh", "testnet"),
        ("bcrt1qs758ursh4q9z627kt3pp5yysm78ddny6txaqgw", "p2wpkh", "regtest"),
    ],
)
def test_type_and_network(address: str, kind: str, network: str) -> None:
    decoded = decode_address(address)
    assert decoded is not None
    assert (decoded.type, decoded.network) == (kind, network)


@pytest.mark.parametrize(
    "text,canonical",
    [
        ("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"),
        ("BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"),
        ("  bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4\n", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"),
        ("TB1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KXPJZSX", "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"),
        ("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"),
        # Mixed case is never bech32 (BIP-173); base58 is case-sensitive.
        ("BC1Qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", None),
        ("bc1qW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4", None),
        ("1BVBMSEYSTWETQTFN5AU4M4GFG7XJANVN2", None),
        ("hello", None),
        ("", None),
    ],
)
def test_normalize_address(text: str, canonical: object) -> None:
    assert normalize_address(text) == canonical
