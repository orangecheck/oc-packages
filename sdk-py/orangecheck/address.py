"""
Bitcoin addresses in the one spelling the family verifies and keys by.

``decode_address`` reads what @orangecheck/bip322's ``decodeAddress`` reads:
lowercase bech32 (witness versions 0 and 1) and base58 P2PKH/P2SH, on
mainnet, testnet/signet and regtest. ``normalize_address`` turns what a
person typed or scanned into that spelling.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Optional

from ._text import js_strip

_BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
_BECH32M_CONST = 0x2BC830A3
_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
# Base58 regtest addresses share testnet's version bytes, so they report testnet.
_B58_VERSIONS = {
    0x00: ("p2pkh", "mainnet"),
    0x05: ("p2sh", "mainnet"),
    0x6F: ("p2pkh", "testnet"),
    0xC4: ("p2sh", "testnet"),
}
_HRP_NETWORKS = {"bc": "mainnet", "tb": "testnet", "bcrt": "regtest"}
# No bech32 string is longer (BIP-173), and no base58 address is longer than 35.
_MAX_ADDRESS_CHARS = 90
_MAX_BASE58_CHARS = 35


@dataclass(frozen=True)
class DecodedAddress:
    #: ``p2pkh``, ``p2sh``, ``p2wpkh``, ``p2wsh`` or ``p2tr``.
    type: str
    #: ``mainnet``, ``testnet`` or ``regtest``.
    network: str
    #: The pubkey hash, script hash, witness program or x-only output key.
    program: bytes


def _polymod(values: list[int]) -> int:
    gen = (0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3)
    chk = 1
    for v in values:
        top = chk >> 25
        chk = (chk & 0x1FFFFFF) << 5 ^ v
        for i in range(5):
            chk ^= gen[i] if ((top >> i) & 1) else 0
    return chk


def _five_to_eight(words: list[int]) -> Optional[bytes]:
    """BIP-173 regrouping with strict padding: None when the padding is wrong."""
    acc = bits = 0
    out = bytearray()
    for w in words:
        acc = (acc << 5) | w
        bits += 5
        while bits >= 8:
            bits -= 8
            out.append((acc >> bits) & 0xFF)
    if bits >= 5 or (acc << (8 - bits)) & 0xFF:
        return None
    return bytes(out)


def _decode_segwit(address: str, hrp: str) -> Optional[DecodedAddress]:
    if len(address) > 90 or address.lower() != address:
        return None
    sep = address.rfind("1")
    if address[:sep] != hrp or len(address) - sep < 8:
        return None
    try:
        data = [_BECH32.index(c) for c in address[sep + 1 :]]
    except ValueError:
        return None
    const = _polymod([ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp] + data)
    words = data[:-6]
    if not words:
        return None
    program = _five_to_eight(words[1:])
    if program is None:
        return None
    network = _HRP_NETWORKS[hrp]
    if words[0] == 0 and const == 1 and len(program) in (20, 32):
        return DecodedAddress("p2wpkh" if len(program) == 20 else "p2wsh", network, program)
    if words[0] == 1 and const == _BECH32M_CONST and len(program) == 32:
        return DecodedAddress("p2tr", network, program)
    return None


def _decode_base58(address: str) -> Optional[DecodedAddress]:
    n = 0
    for c in address:
        i = _B58.find(c)
        if i < 0:
            return None
        n = n * 58 + i
    raw = b"\0" * (len(address) - len(address.lstrip("1"))) + n.to_bytes((n.bit_length() + 7) // 8, "big")
    payload, check = raw[:-4], raw[-4:]
    if len(payload) != 21 or payload[0] not in _B58_VERSIONS:
        return None
    if hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4] != check:
        return None
    kind, network = _B58_VERSIONS[payload[0]]
    return DecodedAddress(kind, network, payload[1:])


def decode_address(address: str) -> Optional[DecodedAddress]:
    """
    Decode an address in its canonical spelling, checksum included: bech32
    lowercase only, so one key never has two addresses that verify. None for
    anything else, uppercase bech32 included; pass what a person typed or
    scanned through ``normalize_address`` first. Text longer than any address
    is refused before it is decoded, so the time this takes does not grow with
    the input.
    """
    if len(address) > _MAX_ADDRESS_CHARS:
        return None
    m = re.match(r"^(bc|tb|bcrt)1", address)
    if m:
        return _decode_segwit(address, m.group(1))
    return _decode_base58(address) if len(address) <= _MAX_BASE58_CHARS else None


def normalize_address(text: str) -> Optional[str]:
    """
    The canonical spelling of an address a person typed or scanned:
    surrounding whitespace dropped, all-capitals bech32 lowercased (QR codes
    carry it that way, which BIP-173 allows), base58 unchanged. None when the
    result is not an address ``decode_address`` reads, mixed-case bech32
    included. Store, key and compare addresses in this form only.
    """
    address = js_strip(text)
    if re.fullmatch(r"(BC|TB|BCRT)1[^a-z]*", address):
        address = address.lower()
    return address if decode_address(address) else None
