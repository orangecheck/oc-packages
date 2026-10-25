"""What a did:oc is, and the form an email address is stored and looked up in.

The same rules as ``@orangecheck/auth-core/identifiers``, held to
``auth-core/test-vectors/identifiers.json``.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from ._text import js_strip

if TYPE_CHECKING:
    from typing_extensions import TypeGuard

__all__ = ["is_did_oc", "normalize_email"]

# \Z, not $: $ also matches before a trailing newline.
_DID_OC = re.compile(r"did:oc:[0-9a-f]{32}\Z")


def is_did_oc(value: object) -> TypeGuard[str]:
    """``did:oc:`` and 32 lowercase hex digits, with nothing before or after it."""
    return isinstance(value, str) and _DID_OC.match(value) is not None


def normalize_email(value: str) -> str:
    """Trimmed of surrounding whitespace, then lower-cased, as auth-core's ``normalizeEmail``.

    Lower-casing follows Python's Unicode version, so a letter cased only in a
    newer Unicode than this Python knows can lower differently in Node.
    """
    return js_strip(value).lower()
