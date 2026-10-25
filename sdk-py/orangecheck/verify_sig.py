"""
Local Bitcoin message-signature verification, by the rule
``@orangecheck/bip322`` verifies by.

Opt-in: requires the ``bip322`` package (install via ``pip install
orangecheck[verify]``), which wraps the Rust ``bitcoin`` / ``secp256k1``
crates for BIP-322.

``verify_bip322_signature(address, message, signature)`` returns ``True``
when ``signature`` signs ``message`` for ``address``, ``False`` otherwise.
Never raises for cryptographic failures — only for a missing optional
dependency (at import time).

- The signature's bytes decide how it is checked. 65 bytes is a legacy
  BIP-137 ``signmessage`` signature, on any address it can stand for
  (P2PKH, P2SH-P2WPKH, P2WPKH, P2TR), whatever its header flag says;
  anything else is BIP-322 simple, with or without the finalized BIP's
  ``smp`` prefix. A ``ful`` or ``pof`` signature is not supported.
- Bech32 addresses verify only in their canonical lowercase spelling; pass
  what a person typed or scanned through
  ``orangecheck.address.normalize_address`` first.
- BIP-137 recovers the signer's key with integer arithmetic over public
  values, then ``cryptography`` (OpenSSL) checks the signature against that
  key, so a mistake in the recovery can only refuse.
"""

from __future__ import annotations

import base64
import hashlib
import re
from typing import Optional, Tuple

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import Prehashed, encode_dss_signature

from ._text import WS
from .address import DecodedAddress, decode_address

try:
    import bip322 as _bip322
except ImportError as e:  # pragma: no cover - optional-dep path
    raise ImportError(
        "orangecheck.verify_sig requires the `bip322` package. "
        "Install with `pip install orangecheck[verify]`."
    ) from e

_P = 2**256 - 2**32 - 977
_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
_G = (
    0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
    0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8,
)
Point = Optional[Tuple[int, int]]


def _add(a: Point, b: Point) -> Point:
    if a is None:
        return b
    if b is None:
        return a
    if a[0] == b[0] and (a[1] + b[1]) % _P == 0:
        return None
    if a == b:
        lam = 3 * a[0] * a[0] * pow(2 * a[1], -1, _P)
    else:
        lam = (b[1] - a[1]) * pow(b[0] - a[0], -1, _P)
    x = (lam * lam - a[0] - b[0]) % _P
    return (x, (lam * (a[0] - x) - a[1]) % _P)


def _mul(k: int, point: Point) -> Point:
    out: Point = None
    while k:
        if k & 1:
            out = _add(out, point)
        point = _add(point, point)
        k >>= 1
    return out


def _lift_x(x: int, odd: int) -> Point:
    if x >= _P:
        return None
    y2 = (pow(x, 3, _P) + 7) % _P
    y = pow(y2, (_P + 1) // 4, _P)
    if y * y % _P != y2:
        return None
    return (x, y if y & 1 == odd else _P - y)


def _sec(point: Tuple[int, int], compressed: bool = True) -> bytes:
    x = point[0].to_bytes(32, "big")
    if compressed:
        return bytes([2 + (point[1] & 1)]) + x
    return b"\x04" + x + point[1].to_bytes(32, "big")


# RIPEMD-160 for hashlib builds without it (OpenSSL 3.0.0–3.0.6 dropped it).
_RL = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
    3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
    1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
    4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
]  # fmt: skip
_RR = [
    5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
    6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
    15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
    8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
    12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
]  # fmt: skip
_SL = [
    11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
    7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
    11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
    11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
    9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
]  # fmt: skip
_SR = [
    8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
    9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
    9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
    15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
    8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
]  # fmt: skip
_KL = (0x00000000, 0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xA953FD4E)
_KR = (0x50A28BE6, 0x5C4DD124, 0x6D703EF3, 0x7A6D76E9, 0x00000000)
_M = 0xFFFFFFFF


def _ripemd160_py(data: bytes) -> bytes:
    def f(j: int, x: int, y: int, z: int) -> int:
        if j < 16:
            return x ^ y ^ z
        if j < 32:
            return (x & y) | (~x & z)
        if j < 48:
            return (x | ~y) ^ z
        if j < 64:
            return (x & z) | (y & ~z)
        return x ^ (y | ~z)

    def rol(x: int, n: int) -> int:
        return ((x << n) | (x >> (32 - n))) & _M

    msg = data + b"\x80" + b"\0" * ((55 - len(data)) % 64) + (8 * len(data)).to_bytes(8, "little")
    h = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0]
    for block in range(0, len(msg), 64):
        x = [int.from_bytes(msg[block + 4 * i : block + 4 * i + 4], "little") for i in range(16)]
        al, bl, cl, dl, el = h
        ar, br, cr, dr, er = h
        for j in range(80):
            t = (rol((al + (f(j, bl, cl, dl) & _M) + x[_RL[j]] + _KL[j // 16]) & _M, _SL[j]) + el) & _M
            al, el, dl, cl, bl = el, dl, rol(cl, 10), bl, t
            t = (rol((ar + (f(79 - j, br, cr, dr) & _M) + x[_RR[j]] + _KR[j // 16]) & _M, _SR[j]) + er) & _M
            ar, er, dr, cr, br = er, dr, rol(cr, 10), br, t
        h = [
            (h[1] + cl + dr) & _M,
            (h[2] + dl + er) & _M,
            (h[3] + el + ar) & _M,
            (h[4] + al + br) & _M,
            (h[0] + bl + cr) & _M,
        ]
    return b"".join(v.to_bytes(4, "little") for v in h)


def _hash160(data: bytes) -> bytes:
    sha = hashlib.sha256(data).digest()
    try:
        return hashlib.new("ripemd160", sha).digest()
    except ValueError:
        return _ripemd160_py(sha)


def _bip86_output_key(point: Tuple[int, int]) -> bytes:
    x = point[0].to_bytes(32, "big")
    tag = hashlib.sha256(b"TapTweak").digest()
    tweak = int.from_bytes(hashlib.sha256(tag + tag + x).digest(), "big")
    out = _add(_lift_x(point[0], 0), _mul(tweak, _G))
    return out[0].to_bytes(32, "big") if out and tweak < _N else b""


def _compact_size(n: int) -> bytes:
    if n < 0xFD:
        return bytes([n])
    if n <= 0xFFFF:
        return b"\xfd" + n.to_bytes(2, "little")
    return b"\xfe" + n.to_bytes(4, "little")


def _decode_base64(s: str) -> bytes:
    """Standard or URL-safe, padded or not; empty when it is not base64."""
    clean = re.sub(WS + "+", "", s).replace("-", "+").replace("_", "/").rstrip("=")
    if not re.fullmatch(r"[A-Za-z0-9+/]*", clean) or len(clean) % 4 == 1:
        return b""
    return base64.b64decode(clean + "=" * (-len(clean) % 4))


def _verify_bip137(addr: DecodedAddress, message: str, sig: bytes) -> bool:
    flag = sig[0] - 27
    if not 0 <= flag <= 15:
        return False
    msg = message.encode("utf-8")
    digest = hashlib.sha256(
        hashlib.sha256(b"\x18Bitcoin Signed Message:\n" + _compact_size(len(msg)) + msg).digest()
    ).digest()
    r = int.from_bytes(sig[1:33], "big")
    s = int.from_bytes(sig[33:65], "big")
    if not (0 < r < _N and 0 < s < _N):
        return False
    big_r = _lift_x(r + (_N if flag & 2 else 0), flag & 1)
    if big_r is None:
        return False
    rinv = pow(r, -1, _N)
    z = int.from_bytes(digest, "big")
    key = _add(_mul(s * rinv % _N, big_r), _mul(-z * rinv % _N, _G))
    if key is None:
        return False
    try:
        public = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256K1(), _sec(key))
        public.verify(encode_dss_signature(r, s), digest, ec.ECDSA(Prehashed(hashes.SHA256())))
    except (InvalidSignature, ValueError):
        return False
    compressed = _sec(key)
    if addr.type == "p2pkh":
        return addr.program in (_hash160(compressed), _hash160(_sec(key, compressed=False)))
    if addr.type == "p2sh":
        return _hash160(b"\x00\x14" + _hash160(compressed)) == addr.program
    if addr.type == "p2wpkh":
        return _hash160(compressed) == addr.program
    if addr.type == "p2tr":
        return _bip86_output_key(key) == addr.program
    return False


def verify_bip322_signature(address: str, message: str, signature: str) -> bool:
    """
    Verify a Bitcoin message signature: BIP-322 simple or legacy BIP-137.

    Parameters
    ----------
    address:
        Bitcoin address the signature claims to be from, in its canonical
        spelling (bech32 lowercase).
    message:
        The exact bytes (as UTF-8 string) that were signed. For OrangeCheck
        attestations this is the canonical message produced by
        ``build_canonical_message``.
    signature:
        Base64, standard or URL-safe: a BIP-322 simple signature, with or
        without the finalized BIP's ``smp`` prefix, or a 65-byte BIP-137
        signature. Hex is NOT accepted — normalize to base64 before calling.

    Returns
    -------
    True if the signature verifies; False otherwise. Never raises for
    invalid / malformed signatures.
    """
    addr = decode_address(address)
    if addr is None or signature.startswith(("ful", "pof")):
        return False
    prefixed = signature.startswith("smp")
    sig = _decode_base64(signature[3:] if prefixed else signature)
    if not sig:
        return False
    # No valid witness serializes to 65 bytes, so a 65-byte blob is BIP-137.
    if not prefixed and (addr.type == "p2pkh" or len(sig) == 65):
        return _verify_bip137(addr, message, sig)
    try:
        _bip322.verify_simple_encoded(address, message, base64.b64encode(sig).decode("ascii"))
    except _bip322.VerificationError:
        return False
    except Exception:
        # Any other surprise (unusual address shape, a witness the bridge
        # cannot parse) counts as "not a valid sig" for our purposes.
        return False
    return True
