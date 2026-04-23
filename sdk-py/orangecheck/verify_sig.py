"""
Local BIP-322 signature verification.

Opt-in: requires the ``bip322`` package (install via ``pip install
orangecheck[verify]``). That package wraps the well-tested Rust
``bitcoin`` / ``secp256k1`` crates — the crypto itself is not implemented
here; we only glue the library to the OrangeCheck canonical-message
convention.

``verify_bip322_signature(address, message, signature)`` returns ``True``
when ``signature`` is a valid BIP-322 simple signature over ``message``
for ``address``, ``False`` otherwise. Never raises for cryptographic
failures — only for a missing optional dependency (at import time).
"""

from __future__ import annotations

try:
    import bip322 as _bip322
except ImportError as e:  # pragma: no cover - optional-dep path
    raise ImportError(
        "orangecheck.verify_sig requires the `bip322` package. "
        "Install with `pip install orangecheck[verify]`."
    ) from e


def verify_bip322_signature(address: str, message: str, signature: str) -> bool:
    """
    Verify a BIP-322 (simple, base64-encoded) signature.

    Parameters
    ----------
    address:
        Bitcoin address (P2WPKH, P2TR, or legacy) the signature claims to
        be from.
    message:
        The exact bytes (as UTF-8 string) that were signed. For OrangeCheck
        attestations this is the canonical message produced by
        ``build_canonical_message``.
    signature:
        Base64-encoded BIP-322 "simple" signature. Hex is NOT accepted —
        normalize to base64 before calling.

    Returns
    -------
    True if the signature verifies; False otherwise. Never raises for
    invalid / malformed signatures.
    """
    try:
        _bip322.verify_simple_encoded(address, message, signature)
    except _bip322.VerificationError:
        return False
    except Exception:
        # Any other surprise (base64 decode failure, unusual address
        # shape) counts as "not a valid sig" for our purposes. Callers
        # wanting the raw error should call bip322.verify_simple_encoded
        # directly.
        return False
    return True
