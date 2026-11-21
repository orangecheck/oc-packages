# `orangecheck` (Python)

The Python twin of `@orangecheck/sdk`. Same canonical messages, same attestation
IDs, same conformance vectors. A message built in TypeScript and a message built
in Python for the same inputs are byte-identical.

It also carries what a Python backend needs to sign people in with
[ochk.app](https://ochk.io/docs/me/quickstart): checking the sign-in token, signing billable events
and checking webhooks, in the same wire formats as `@orangecheck/me-client`.

## Install

```bash
pip install orangecheck
# with local BIP-322 signature checks (Rust-backed via the bip322 extra):
pip install 'orangecheck[verify]'
```

Python 3.9 or later. Runs on Linux, macOS, Windows. The ochk.app sign-in
functions need 2.3 or later, Connect 2.13, and refusing a token without `rh`
3.0.

## Core exports

```python
from orangecheck import (
    # Stake checks against the hosted API
    check,
    verify,
    discover,

    # Canonical message primitives (no network)
    build_canonical_message,
    attestation_id,
    format_identities,
    parse_identities,
    score_v0,

    # Challenge flow
    challenge_issue,
    challenge_verify,

    # ochk.app sign-in, events and webhooks, for your backend
    verify_session,
    check_oc_session,  # 3.2 or later
    warm_session,
    SignInPolicy,
    RevocationList,
    bond_meets,
    sign_event,
    verify_webhook,

    # After a sign-in: one session per token, then end it (3.2 or later)
    spend_once,
    MemoryJtiStore,
    revoke_token,

    # OC Connect, for a site with its own login (2.13 or later)
    connect_provision,
    connect_claim_link,
    connect_delete,
    CONNECT_CONSENT_LABEL,
    CONNECT_CONSENT_BLURB,

    # Clients and types
    Client,
    AsyncClient,
    CheckResult,
    VerifyOutcome,
    IdentityBinding,
    Session,
    ConnectAccount,
    ConnectClaimLink,
    ConnectDeleted,
    ConnectRefusal,
    SessionCheck,
    TokensRevoked,
    RevokeRefusal,

    # Errors
    OrangeCheckError,
    InvalidSession,
    BondRequired,
    SessionEnded,
    InvalidWebhook,
)

# Present when installed with 'orangecheck[verify]', None otherwise
from orangecheck import verify_bip322_signature
```

## `check()`

```python
from orangecheck import check

result = check(
    addr='bc1q...',
    min_sats=100_000,
    min_days=30,
)

if result.ok:
    print(result.sats, result.days, result.score)
else:
    print(result.reasons)
```

Accepts `addr`, `id`, or `identity=...`, one of the three. Applies thresholds.
Same return shape as the hosted `/api/check`. The top-level functions are
synchronous; in async code, use `AsyncClient`:

```python
import asyncio

from orangecheck import AsyncClient


async def main() -> None:
    async with AsyncClient() as oc:
        result = await oc.check(addr='bc1q...', min_sats=100_000, min_days=30)


asyncio.run(main())
```

## `verify()`

```python
from orangecheck import verify

canonical_message: str  # the exact message the wallet signed
signature_base64: str

outcome = verify(
    addr='bc1q...',
    msg=canonical_message,
    sig=signature_base64,
    scheme='bip322',
)

if outcome.ok:
    print(outcome.sats_bonded, outcome.days_unspent)
else:
    print(outcome.codes)
```

`verify()` asks the hosted API, which checks the signature and the address's
live chain state. To check only a signature on your own machine, install the
`[verify]` extra and call `verify_bip322_signature(address, message, signature)`
(the Rust-backed `bip322` package, which wraps the audited `bitcoin` and
`secp256k1` crates).

## Canonical message

```python
from orangecheck import IdentityBinding, attestation_id, build_canonical_message

msg = build_canonical_message(
    address='bc1qalice...',
    identities=[
        IdentityBinding(protocol='github', identifier='alice'),
        IdentityBinding(protocol='nostr', identifier='npub1alice...'),
    ],
    extensions={},
    nonce='a3f5b8c2d1e4f6a7b8c9d0e1f2a3b4c5',
    issued_at='2026-04-24T06:47:29.977Z',
)

aid = attestation_id(msg)
```

Byte-identical to the TypeScript SDK's `buildCanonicalMessage()`. Same sort
order, same line endings, same hash.

## Scoring

```python
from orangecheck import score_v0

score = score_v0(sats_bonded=125_000, days_unspent=47)
# → 30.12
```

Reference score only; raw metrics are the authoritative signal.

## ochk.app sign-in, events and webhooks

For a site whose people sign in through the [ochk.app popup](https://ochk.io/docs/me/quickstart).
The popup runs in your page; these run on your server.

### Check the sign-in token

```python
from orangecheck import InvalidSession, verify_session

token: str  # the token the popup returned

try:
    session = verify_session(token, audience='https://your-site.example')
except InvalidSession as err:
    ...  # err.reason: audience, expired, signature, unknown_key, …

session.did_oc  # the person; keep it beside your user row
```

`audience` is the origin of the page that opened the popup, exactly
(`http://localhost:5173` while you develop). The key set,
`https://ochk.io/.well-known/jwks.json` (or `<issuer>/.well-known/jwks.json` for
another `issuer=`, 3.2 or later), is fetched and cached for an hour, and kept
through an outage; pass `jwks=` to check offline. A token for any other
origin, or one with no `aud`, is refused. The token carries no email address.
What each claim means is in [verify without the SDK](https://ochk.io/docs/me/sdk#verify-without-the-sdk).

Who may sign in (`SignInPolicy`, `BondRequired`), the HTTP answer for a request
(`check_oc_session`), sessions ended everywhere (`RevocationList`,
`SessionEnded`), spending and ending the token (`spend_once`, `revoke_token`) and
keeping their reads off your requests (`warm_session`) are in the SDK reference:
[checking the session on your server](https://ochk.io/docs/me/sdk#checking-the-session-on-your-server),
[ending a session](https://ochk.io/docs/me/sdk#ending-a-session),
[when someone ends every session](https://ochk.io/docs/me/sdk#when-someone-ends-every-session) and
[Python: warming](https://ochk.io/docs/me/sdk#python-warming).

### Sign a billable event

```python
import json, os

import httpx
from orangecheck import Session, sign_event

PROJECT_KEY = os.environ['OC_PROJECT_KEY']
SIGNING_SECRET = os.environ['OC_SIGNING_SECRET']
session: Session  # from verify_session above

body = json.dumps({
    'project_key': PROJECT_KEY,
    'subtype': 'account_creation',
    'user_address': session.did_oc,
})
httpx.post(
    'https://me.ochk.io/api/integrator/event',
    content=body,  # exactly the string that was signed
    headers={
        'Content-Type': 'application/json',
        'X-OC-Signature': sign_event(SIGNING_SECRET, body),
    },
)
```

Every answer the endpoint gives is in [signing an event](https://ochk.io/docs/me/api#signing-an-event).

### Check a webhook

```python
from typing import Any, Mapping

from orangecheck import InvalidWebhook, verify_webhook

headers: Mapping[str, Any]  # the request's headers
raw_body: bytes  # the request body, unparsed

event = verify_webhook(headers, raw_body)  # raises InvalidWebhook
```

Pass the raw body, before any JSON parsing. The key set is
`https://me.ochk.io/api/dev-jwks`. A full receiver is on
[Webhooks](https://ochk.io/docs/me/webhooks#reception--python).

## Framework integration

### Django

```python
from django.http import JsonResponse
from orangecheck import check

def gated_view(request):
    addr = request.session.get('verified_address', '')
    r = check(addr=addr, min_sats=100_000, min_days=30)
    if not r.ok:
        return JsonResponse({'error': 'gated', 'reasons': list(r.reasons)}, status=403)
    return JsonResponse({'ok': True})
```

### FastAPI

```python
from fastapi import Depends, FastAPI, HTTPException
from orangecheck import AsyncClient

app = FastAPI()

async def require_stake(addr: str):
    async with AsyncClient() as oc:
        r = await oc.check(addr=addr, min_sats=100_000, min_days=30)
    if not r.ok:
        raise HTTPException(status_code=403, detail=list(r.reasons))
    return addr

@app.post('/post')
async def post(addr: str = Depends(require_stake)):
    return {'ok': True}
```

### Flask

```python
from flask import Flask, jsonify, request
from orangecheck import check

app = Flask(__name__)

@app.post('/post')
def post():
    addr = request.headers.get('X-Bitcoin-Address', '')
    r = check(addr=addr, min_sats=100_000, min_days=30)
    if not r.ok:
        return jsonify(error='gated', reasons=list(r.reasons)), 403
    return jsonify(ok=True)
```

## Conformance

The package ships a pytest suite that loads the canonical fixtures from
`oc-attest-protocol/conformance/vectors/` (vendored) and asserts byte-identical
output to the TypeScript SDK. The ochk.app functions are held to the vectors
`@orangecheck/me-client` is tested against (`me-client/test-vectors/integrator.json`
and `server-helpers.json` in `oc-packages`). CI fails on drift.

## Naming conventions

Python uses `snake_case` where TypeScript uses `camelCase`:

| TypeScript                          | Python                                |
| ----------------------------------- | ------------------------------------- |
| `minSats`, `minDays`                | `min_sats`, `min_days`                |
| `attestationId`                     | `attestation_id`                      |
| `issueChallenge`, `verifyChallenge` | `challenge_issue`, `challenge_verify` |
| `buildCanonicalMessage`             | `build_canonical_message`             |
| `verifyOcToken`                     | `verify_session`                      |
| `withOcAuth` (its answer)           | `check_oc_session`                    |
| `spendOnce`, `revokeToken`          | `spend_once`, `revoke_token`          |
| `oc.webhook.verify`                 | `verify_webhook`                      |

Each follows its language's idioms. The underlying behavior is identical.

## Versions

What each version changed is in the package's
[CHANGELOG](https://github.com/orangecheck/oc-packages/blob/main/sdk-py/CHANGELOG.md).
Releases after 3.6.0 also carry it in the wheel, as `orangecheck/CHANGELOG.md`,
and PyPI links it as "Changelog".

## See also

- [**`@orangecheck/sdk`**](https://ochk.io/docs/sdk/sdk/README) — the TypeScript twin
- [**ochk.app quickstart**](https://ochk.io/docs/me/quickstart) — sign-in and paying your users
- [**Canonical message format**](https://ochk.io/docs/ecosystem/canonical-message)
- [**BIP-322 signing**](https://ochk.io/docs/ecosystem/bip322) — how the `[verify]` extra wires into
  the Rust crate
- [**Conformance vectors**](https://ochk.io/docs/ecosystem/conformance)
