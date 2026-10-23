"""
OC Connect from a site's own backend: the site keeps its own login and makes
an orangecheck account for its user with one call (ochk.io/docs/connect).

    from orangecheck import connect_provision, connect_claim_link, connect_delete

    result = connect_provision(api_key, user.id, consent=True)  # only on a ticked box
    if result.ok:
        user.did_oc = result.did_oc

A refusal or an outage is a result (``ConnectRefusal(reason, status)``), never
an exception, so a failed call can't block the site's own login. Only a mistake
in the call itself raises, before anything is sent: an argument it does not
take, a missing key or user id, or ``consent=False``. Every call goes to
https://ochk.io and nowhere else, and a redirect is an error.

The same requests and results as ``@orangecheck/me-client/server``, held to
``me-client/test-vectors/connect.json``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal, Optional, Union
from urllib.parse import urlsplit

import httpx

#: The checkbox label for an optional "also make me an orangecheck account" box.
CONNECT_CONSENT_LABEL = "Also create my orangecheck account"
#: The line under the label.
CONNECT_CONSENT_BLURB = (
    "It stays with orangecheck until you claim it at ochk.app. Then you can use it on "
    "other sites, or delete it."
)

#: The only place a call goes: the key never travels anywhere else.
_ORIGIN = "https://ochk.io"
_DEFAULT_TIMEOUT = 5.0
_MAX_TIMEOUT = 30.0
_DID_OC = re.compile(r"^did:oc:[0-9a-f]{32}$")

_PROVISION_REASONS = frozenset(
    {"account_deleted", "daily_limit", "rate_limited", "invalid_api_key", "app_suspended", "bad_request"}
)
_DELETE_REASONS = frozenset(
    {"unknown_user", "holds_earnings", "not_deletable", "rate_limited", "invalid_api_key", "bad_request"}
)
_CLAIM_LINK_REASONS = frozenset(
    {"unknown_user", "already_claimed", "rate_limited", "invalid_api_key", "app_suspended", "bad_request"}
)
_DELETE_RESULTS = frozenset({"deleted", "detached", "already_deleted"})


@dataclass(frozen=True)
class ConnectRefusal:
    """ochk.io did not do it. ``reason`` is one word; ``unavailable`` covers an
    outage, a timeout and any answer this SDK can't read (try again later).
    ``status`` is ochk.io's HTTP status, 0 when nothing came back."""

    reason: str
    status: int
    ok: Literal[False] = False


@dataclass(frozen=True)
class ConnectAccount:
    """The orangecheck account for your user. Keep ``did_oc`` on your user record."""

    did_oc: str
    is_new: bool
    ok: Literal[True] = True


@dataclass(frozen=True)
class ConnectClaimLink:
    """A link for your signed-in user to claim their account. Good once, until ``expires_at``."""

    url: str
    expires_at: str
    ok: Literal[True] = True


@dataclass(frozen=True)
class ConnectDeleted:
    """``deleted``, ``detached`` (the person claimed it, so it stays theirs) or ``already_deleted``."""

    result: str
    ok: Literal[True] = True


def _utf16_units(s: str) -> int:
    """A string's length as JavaScript and ochk.io count it: an emoji is two."""
    return len(s.encode("utf-16-le")) // 2


def _check_call(api_key: Any, user_id: Any, timeout: Any) -> None:
    if not isinstance(api_key, str) or not api_key.strip():
        raise ValueError("api_key is required (your Connect API key)")
    if not isinstance(user_id, str) or not 1 <= _utf16_units(user_id) <= 256:
        raise ValueError("user_id must be your user's id, 1 to 256 characters")
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 0 < timeout <= _MAX_TIMEOUT:
        raise ValueError(f"timeout must be above 0 and at most {_MAX_TIMEOUT:g} seconds")


def _post(path: str, api_key: str, body: dict[str, Any], timeout: float) -> tuple[int, Optional[dict[str, Any]]]:
    try:
        resp = httpx.post(
            f"{_ORIGIN}{path}",
            json=body,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            timeout=timeout,
            follow_redirects=False,
        )
    except httpx.HTTPError:
        return 0, None
    # These endpoints never redirect, so a redirect is an error, as in me-client:
    # the key and the body go to ochk.io and nowhere else.
    if resp.is_redirect or 300 <= resp.status_code < 400:
        return 0, None
    try:
        data = resp.json()
    except ValueError:
        data = None
    return resp.status_code, data if isinstance(data, dict) else None


def _refused(status: int, body: Optional[dict[str, Any]], known: frozenset[str]) -> ConnectRefusal:
    said = body.get("reason") if body else None
    if said == "missing_api_key":
        said = "invalid_api_key"
    return ConnectRefusal(reason=said if isinstance(said, str) and said in known else "unavailable", status=status)


def connect_provision(
    api_key: str,
    user_id: str,
    *,
    consent: Optional[Literal[True]] = None,
    email: Optional[str] = None,
    email_verified: Optional[bool] = None,
    timeout: float = _DEFAULT_TIMEOUT,
) -> Union[ConnectAccount, ConnectRefusal]:
    """Make (or find) the orangecheck account for one of your users.

    Idempotent: the same user always gets the same ``did_oc``. Pass
    ``consent=True`` only when the person ticked your "Also create my
    orangecheck account" box just now; leave it out when you show no box. An
    unticked box means no call at all, so ``consent=False`` raises.
    """
    _check_call(api_key, user_id, timeout)
    if consent is not None and consent is not True:
        raise ValueError(
            "consent must be True or left out. An unticked box means no call at all; "
            "a call without consent makes an account nobody asked for"
        )
    if email is not None and (not isinstance(email, str) or not email):
        raise ValueError("email must be a non-empty string")
    if email_verified is not None and not isinstance(email_verified, bool):
        raise ValueError("email_verified must be a bool")
    if email_verified is not None and email is None:
        raise ValueError("email_verified describes email, so pass email too")
    body: dict[str, Any] = {"user_id": user_id}
    if consent is True:
        body["consent"] = True
    if email is not None:
        body["email"] = email
    if email_verified is not None:
        body["email_verified"] = email_verified
    status, data = _post("/api/connect/provision", api_key, body, timeout)
    if status != 200:
        return _refused(status, data, _PROVISION_REASONS)
    did = data.get("did_oc") if data else None
    is_new = data.get("is_new") if data else None
    if data and data.get("ok") is True and isinstance(did, str) and _DID_OC.match(did) and isinstance(is_new, bool):
        return ConnectAccount(did_oc=did, is_new=is_new)
    return ConnectRefusal(reason="unavailable", status=200)


def connect_claim_link(
    api_key: str,
    user_id: str,
    *,
    timeout: float = _DEFAULT_TIMEOUT,
) -> Union[ConnectClaimLink, ConnectRefusal]:
    """A link for your signed-in user to claim their account at ochk.app. Good once, for fifteen minutes.

    A link anywhere but https://ochk.app is refused (``unavailable``), so you
    never send your user somewhere else.
    """
    _check_call(api_key, user_id, timeout)
    status, data = _post("/api/connect/claim-link", api_key, {"user_id": user_id}, timeout)
    if status != 200:
        return _refused(status, data, _CLAIM_LINK_REASONS)
    url = data.get("url") if data else None
    expires_at = data.get("expires_at") if data else None
    if (
        data
        and data.get("ok") is True
        and isinstance(url, str)
        and urlsplit(url).scheme == "https"
        # The whole netloc, so a user name, password or port on ochk.app is refused too.
        and urlsplit(url).netloc == "ochk.app"
        and isinstance(expires_at, str)
        and expires_at
    ):
        return ConnectClaimLink(url=url, expires_at=expires_at)
    return ConnectRefusal(reason="unavailable", status=200)


def connect_delete(
    api_key: str,
    user_id: str,
    *,
    timeout: float = _DEFAULT_TIMEOUT,
) -> Union[ConnectDeleted, ConnectRefusal]:
    """Your user deleted their account with you: delete the one Connect made for them."""
    _check_call(api_key, user_id, timeout)
    status, data = _post("/api/connect/delete", api_key, {"user_id": user_id}, timeout)
    if status != 200:
        return _refused(status, data, _DELETE_REASONS)
    result = data.get("result") if data else None
    if data and data.get("ok") is True and isinstance(result, str) and result in _DELETE_RESULTS:
        return ConnectDeleted(result=result)
    return ConnectRefusal(reason="unavailable", status=200)
