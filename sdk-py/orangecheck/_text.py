r"""Whitespace and digits as the family's TypeScript packages read them.

``JS_WHITESPACE`` is exactly what ECMAScript's ``\s`` matches and ``trim``
removes. Python's ``\s`` and ``str.strip()`` also take U+001C to U+001F and
U+0085 and leave U+FEFF, and ``\d`` takes every Unicode digit. Code that must
agree with a TypeScript twin matches with these instead, held to
``pledge-core/test-vectors/text-classes.json``.
"""

from __future__ import annotations

import re

__all__ = ["JS_DOT", "JS_WHITESPACE", "NOT_WS", "WS", "js_pattern", "js_regex", "js_strip"]

JS_WHITESPACE = "\t\n\v\f\r \xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
#: One whitespace character, as a regex class.
WS = f"[{JS_WHITESPACE}]"
#: One character that is not whitespace, as a regex class.
NOT_WS = f"[^{JS_WHITESPACE}]"


def js_strip(value: str) -> str:
    """``value`` without the surrounding whitespace JavaScript's ``trim`` removes."""
    return value.strip(JS_WHITESPACE)


#: What JavaScript's ``.`` matches: anything but a line terminator. Write it where a
#: pattern means ``.``; ``js_pattern`` leaves ``.`` alone.
JS_DOT = "[^\n\r\u2028\u2029]"


def js_pattern(pattern: str) -> str:
    r"""``pattern`` with ``\d``, ``\s`` and ``\S`` read as JavaScript reads them."""
    return pattern.replace(r"\d", "[0-9]").replace(r"\s", WS).replace(r"\S", NOT_WS)


def js_regex(pattern: str) -> re.Pattern[str]:
    """``js_pattern(pattern)``, compiled."""
    return re.compile(js_pattern(pattern))
