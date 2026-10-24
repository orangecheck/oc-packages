"""Where to send someone back to after they sign in or prove it is them again."""

from __future__ import annotations

import re
from urllib.parse import unquote, urlsplit

__all__ = ["safe_return_path"]

# Control characters, which browsers drop ("/\t/evil.com" becomes "//evil.com"), and backslash.
_REFUSED = re.compile(r"[\x00-\x1f\x7f-\x9f\\]")
# A percent not followed by two hex digits; decodeURIComponent throws on it.
_STRAY_PERCENT = re.compile(r"%(?![0-9A-Fa-f]{2})")
# A dot segment, plain or percent-encoded, which can collapse into "//" ("/..//evil.com").
_DOTS = re.compile(r"(?:\.|%2e){1,2}", re.IGNORECASE)


def safe_return_path(value: object, fallback: str = "/") -> str:
    """A path on your own site, or ``fallback``.

    Refuses anything a browser would take to another site (``//evil.com``,
    ``/\\evil.com``, a scheme), a backslash anywhere, control characters, a
    percent that does not decode, and dot segments. me-client's
    ``safeReturnPath`` answers the same for every input in
    me-client/test-vectors/return-path.json.
    """
    # The length me-client measures: UTF-16 code units, so the two agree at the limit.
    if not isinstance(value, str) or not value or len(value.encode("utf-16-le")) // 2 > 2048:
        return fallback
    if not value.startswith("/") or value.startswith(("//", "/\\")) or _REFUSED.search(value):
        return fallback
    # A stray %, or bytes that are not UTF-8: me-client's decodeURIComponent throws on both.
    if _STRAY_PERCENT.search(value):
        return fallback
    try:
        unquote(value, errors="strict")
    except UnicodeDecodeError:
        return fallback
    if any(_DOTS.fullmatch(s) for s in re.split(r"[?#]", value, maxsplit=1)[0].split("/")):
        return fallback
    # Returned as given, so me-client answers byte for byte the same; the parse only confirms it.
    parts = urlsplit(value)
    return value if not parts.scheme and not parts.netloc else fallback
