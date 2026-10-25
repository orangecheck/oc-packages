"""The family's rule for a name someone chooses and other people are shown.

The same rule as ``@orangecheck/auth-core/display-name``, held to
``auth-core/test-vectors/display-name.json``: a project's or an app's name, a
team's, a channel's or a profile's, on orangecheck's own pages, notices and
email. Character categories and NFKC follow this Python's Unicode version, so a
character newer than it can read differently than in Node.
"""

from __future__ import annotations

import unicodedata
from typing import Literal, Optional

from ._confusables import CONFUSABLE_PROTOTYPES
from ._text import JS_WHITESPACE

__all__ = ["NameProblem", "is_reserved_name", "name_problem"]

NameProblem = Literal["required", "too_long", "hidden_characters", "reserved"]

#: Names only orangecheck itself goes by.
_RESERVED_NAMES = frozenset({"orangecheck", "ochk", "ochk.io", "ochk.app"})
_RESERVED_PREFIXES = frozenset(n[: i + 1] for n in _RESERVED_NAMES for i in range(len(n)))

#: Each character drawn like a letter of a reserved name, to that letter (UTS #39 confusables).
_PROTOTYPE = {ch: prototype for prototype, sources in CONFUSABLE_PROTOTYPES for ch in sources}

#: Spacing, and the variation selectors that change no letter.
_SPACING = frozenset(JS_WHITESPACE) | frozenset(chr(c) for c in range(0xFE00, 0xFE10))
_SPACING_RANGE = (0xE0100, 0xE01EF)

#: Beyond control, format and surrogate characters: the fillers that render as nothing.
_HIDDEN_RANGES = (
    (0x034F, 0x034F),
    (0x115F, 0x1160),
    (0x17B4, 0x17B5),
    (0x180B, 0x180F),
    (0x2800, 0x2800),
    (0x3164, 0x3164),
    (0xFFA0, 0xFFA0),
    (0xFFF0, 0xFFF8),
    (0xE0000, 0xE00FF),
    (0xE01F0, 0xE0FFF),
)


def _hidden(ch: str) -> bool:
    if unicodedata.category(ch) in ("Cc", "Cf", "Cs"):
        return True
    cp = ord(ch)
    return any(lo <= cp <= hi for lo, hi in _HIDDEN_RANGES)


def _spacing(ch: str) -> bool:
    return ch in _SPACING or _SPACING_RANGE[0] <= ord(ch) <= _SPACING_RANGE[1]


def _readings(ch: str) -> list[str]:
    """Its prototype as written, and after NFKC and lower case."""
    return [
        "".join(_PROTOTYPE.get(c, c) for c in form)
        for form in (ch, unicodedata.normalize("NFKC", ch).lower())
    ]


def _allowed(allow_reserved: object, where: str) -> bool:
    if not isinstance(allow_reserved, bool):
        raise TypeError(f"orangecheck: {where}: allow_reserved must be True or False")
    return allow_reserved


def _words(value: str) -> list[tuple[str, bool]]:
    """Its characters, spacing dropped, each marked where a reader sees a word begin.

    After spacing, at and after punctuation, at a small letter followed by a
    capital ("myOrange"), and at the last capital of a run before a small
    letter ("OCHKTeam").
    """
    kept: list[tuple[str, bool]] = []
    spaced = False
    for ch in value:
        if _spacing(ch):
            spaced = spaced or ch in JS_WHITESPACE
            continue
        kept.append((ch, spaced))
        spaced = False
    cat = unicodedata.category
    out = []
    for i, (ch, spaced_before) in enumerate(kept):
        prev = kept[i - 1][0] if i > 0 else None
        nxt = kept[i + 1][0] if i + 1 < len(kept) else None
        starts = (
            prev is None
            or spaced_before
            or cat(prev)[0] not in "LNM"
            or cat(ch)[0] not in "LNM"
            or (cat(prev) == "Ll" and cat(ch) == "Lu")
            or (cat(prev) == "Lu" and cat(ch) == "Lu" and nxt is not None and cat(nxt) == "Ll")
        )
        out.append((ch, starts))
    return out


def is_reserved_name(value: str, *, allow_reserved: bool = False) -> bool:
    """True when ``value`` holds one of orangecheck's own names as a whole word.

    Whatever its case, width, spacing or variation selectors, and when drawn
    with look-alike letters from another script or digits (UTS #39).
    "OrangeCheck Support" and "ochk.io team" read as ours; "orangecheckers"
    and "Brochk" do not. Always False with ``allow_reserved``, which a caller
    sets only for orangecheck's own records.
    """
    if _allowed(allow_reserved, "is_reserved_name"):
        return False
    if not isinstance(value, str):
        raise TypeError("orangecheck: is_reserved_name: value must be a str")
    chars = _words(value)
    for start, (_, starts) in enumerate(chars):
        if not starts:
            continue
        spelt = {""}
        i = start
        while i < len(chars) and spelt:
            spelt = {h + r for h in spelt for r in _readings(chars[i][0]) if h + r in _RESERVED_PREFIXES}
            word_ends = i + 1 == len(chars) or chars[i + 1][1]
            if word_ends and any(name in _RESERVED_NAMES for name in spelt):
                return True
            i += 1
    return False


def name_problem(
    value: str, max_length: float, *, allow_reserved: bool = False
) -> Optional[NameProblem]:
    """Why a name (already trimmed) cannot be stored, or None when it can.

    ``max_length`` counts code points. With ``allow_reserved`` (orangecheck's
    own record), one of our names is not a problem; every other check still
    applies.
    """
    allow = _allowed(allow_reserved, "name_problem")
    if not isinstance(value, str):
        raise TypeError("orangecheck: name_problem: value must be a str")
    if not value:
        return "required"
    if len(value) > max_length:
        return "too_long"
    if any(_hidden(ch) for ch in value):
        return "hidden_characters"
    if not allow and is_reserved_name(value):
        return "reserved"
    return None
