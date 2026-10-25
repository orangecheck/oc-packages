"""What a did:oc is, and the form an email address is stored and looked up in.

The same rules as ``@orangecheck/auth-core/identifiers``, held to
``auth-core/test-vectors/identifiers.json``.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from typing_extensions import TypeGuard

__all__ = ["is_did_oc", "normalize_email"]

# \Z, not $: $ also matches before a trailing newline.
_DID_OC = re.compile(r"did:oc:[0-9a-f]{32}\Z")
# What JavaScript's String.prototype.trim removes. str.strip() with no argument
# also strips U+001C to U+001F and U+0085, which auth-core keeps.
_JS_TRIM = "\t\n\v\f\r \xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"


def is_did_oc(value: object) -> TypeGuard[str]:
    """``did:oc:`` and 32 lowercase hex digits, with nothing before or after it."""
    return isinstance(value, str) and _DID_OC.match(value) is not None


def normalize_email(value: str) -> str:
    """Trimmed of surrounding whitespace, then lower-cased, as auth-core's ``normalizeEmail``.

    Lower-casing follows Python's Unicode version, so a letter cased only in a
    newer Unicode than this Python knows can lower differently in Node.
    """
    return value.strip(_JS_TRIM).lower()
