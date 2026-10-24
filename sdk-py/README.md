# `orangecheck` — Python SDK

**Proof of Bitcoin stake for the open web.** Python SDK for OrangeCheck.

A sybil-resistance primitive any Python app can consume in one call. Works with Django, Flask, FastAPI, Starlette, or a plain script.

```bash
pip install orangecheck
```

---

## The 30-second integration

```python
from orangecheck import check

result = check(addr="bc1q...", min_sats=100_000, min_days=30)

if result.ok:
    # let them through
    ...
else:
    print("rejected:", result.reasons)
```

That's it. `check()` queries the hosted `ochk.io` API, which discovers the most recent attestation for the address on Nostr, verifies the Bitcoin signature, recomputes live chain state, and compares against your thresholds.

---

## Load-bearing functions

```python
from orangecheck import check, verify, discover, challenge_issue, challenge_verify

# Gate
check(addr="bc1q...", min_sats=100_000, min_days=30)
check(id="a3f5b8c2...", min_sats=100_000)
check(identity="github:alice", min_sats=50_000)

# Verify a raw attestation
verify(addr="bc1q...", msg=canonical_message, sig=signature)

# List attestations for a subject
discover(addr="bc1q...", limit=10)

# Signed-challenge auth (prove address control)
ch       = challenge_issue(addr="bc1q...", audience="https://example.com")
verified = challenge_verify(message=ch.message, signature=user_sig, expected_nonce=ch.nonce)
```

All return typed dataclasses. All raise `OrangeCheckError` (or subclasses) on transport / server errors.

---

## Django integration

```python
# views.py
from django.http import HttpResponse, JsonResponse
from orangecheck import check

def gated_post(request):
    addr = request.session.get("btc_address")
    if not addr:
        return HttpResponse(status=401)
    result = check(addr=addr, min_sats=100_000, min_days=30)
    if not result.ok:
        return JsonResponse({"error": "orangecheck", "reasons": result.reasons}, status=403)
    # ... proceed
    return JsonResponse({"ok": True})
```

### As middleware

```python
# orangecheck_middleware.py
from django.http import JsonResponse
from orangecheck import check

class OrangeCheckMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/protected/"):
            addr = request.session.get("btc_address")
            r = check(addr=addr, min_sats=100_000, min_days=30)
            if not r.ok:
                return JsonResponse({"error": r.reasons}, status=403)
        return self.get_response(request)
```

---

## FastAPI integration

```python
from fastapi import FastAPI, Depends, HTTPException
from orangecheck import AsyncClient

app = FastAPI()
oc  = AsyncClient()

async def require_stake(addr: str, min_sats: int = 100_000, min_days: int = 30):
    r = await oc.check(addr=addr, min_sats=min_sats, min_days=min_days)
    if not r.ok:
        raise HTTPException(status_code=403, detail={"reasons": list(r.reasons)})
    return r

@app.post("/post")
async def post_comment(gate = Depends(require_stake)):
    return {"ok": True, "sats": gate.sats}
```

---

## Flask integration

```python
from functools import wraps
from flask import Flask, request, jsonify
from orangecheck import check

app = Flask(__name__)

def require_orangecheck(min_sats=100_000, min_days=30):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            addr = request.headers.get("X-OC-Address")
            r = check(addr=addr, min_sats=min_sats, min_days=min_days)
            if not r.ok:
                return jsonify(error="orangecheck", reasons=r.reasons), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator

@app.post("/post")
@require_orangecheck(min_sats=100_000, min_days=30)
def post_comment():
    return {"ok": True}
```

---

## Async

Every function has a sync counterpart on `AsyncClient`:

```python
import asyncio
from orangecheck import AsyncClient

async def main():
    async with AsyncClient() as oc:
        r = await oc.check(addr="bc1q...", min_sats=100_000)
        print(r.ok, r.sats, r.days)

asyncio.run(main())
```

---

## ochk.app sign-in, for your backend

A site whose people sign in with ochk.app verifies the token the popup hands
back, signs billable events and checks webhooks with three functions. They
speak the same wire formats as `@orangecheck/me-client`.

```python
import json, httpx
from orangecheck import verify_session, sign_event, verify_webhook, InvalidSession, SignInPolicy

# The origin of the page that opened the popup, exactly.
session = verify_session(token, audience="https://your-site.example")
session.did_oc  # who signed in

# Who may sign in: your project's requirement, set on ochk.app (2.9.0 or later).
# BondRequired (an InvalidSession) carries need, have and back_url.
POLICY = SignInPolicy(PROJECT_KEY)
session = verify_session(token, audience="https://your-site.example", policy=POLICY)
# Or in code, which wins over the project's: require_bond={"min_sats": 100000, "min_days": 30}

body = json.dumps({"project_key": PROJECT_KEY, "subtype": "account_created",
                   "user_address": session.did_oc})
httpx.post("https://me.ochk.io/api/integrator/event", content=body, headers={
    "Content-Type": "application/json",
    "X-OC-Signature": sign_event(SIGNING_SECRET, body),
})

event = verify_webhook(request.headers, raw_body)  # raises InvalidWebhook
```

A token verifies until it expires, up to 30 days. To refuse one the person
ended everywhere (signed out everywhere, removed a passkey, deleted the
account), keep one `RevocationList` (2.8.0 or later) per process and pass it with the request's
method. It reads me.ochk.io's list of ended sessions for the token's origin at most
once a minute, signed with your secret:

```python
from orangecheck import RevocationList, SessionEnded

REVOCATIONS = RevocationList(PROJECT_KEY, SIGNING_SECRET)

session = verify_session(token, audience="https://your-site.example",
                         revocations=REVOCATIONS, method=request.method)
# SessionEnded (an InvalidSession) when the person ended it. While the list
# can't be read, reads go on and writes raise reason "revocations_unavailable".
# If your own session replaces the token, keep its rh, aud and iat with that
# session and ask REVOCATIONS.status(rh, aud, iat): "revoked" ends it.
```

A token with no `rh` is refused with reason `no_session_handle` (3.0.0 or
later), since sign out everywhere can't reach it. Every token from the sign-in
popup carries one; `require_handle=False` accepts one minted some other way.

`BondRequired` and `SessionEnded` are both `InvalidSession`s, so catch them
before `InvalidSession`, or that handler takes them too.

The key set, the policy and the list are each fetched inside the call that first
needs them. To keep those fetches off your requests, warm them at startup and
every ten seconds from a background thread in each process (2.10.0 or later). One
`SignInPolicy` and one `RevocationList` are safe to share between threads.

```python
import logging, threading, time
from orangecheck import warm_session

def keep_warm() -> None:
    while True:
        result = warm_session("https://your-site.example", revocations=REVOCATIONS, policy=POLICY)
        if not result.ok:  # 2.11.0 or later: what failed, and why
            logging.warning("orangecheck warming: %s", "; ".join(result.failures()))
        time.sleep(10)

threading.Thread(target=keep_warm, daemon=True).start()
```

`check_oc_session` (3.2.0 or later) takes the same arguments and gives the HTTP
answer instead of raising, with the status and body `@orangecheck/me-client`'s
adapters send: 401 for no token, a bad one or one the person ended; 403
`bond_required`; 503 while the list, the key set or the rule can't be read, so
the client tries again rather than signing the person out.

```python
from orangecheck import check_oc_session

checked = check_oc_session(bearer, "https://your-site.example",
                           revocations=REVOCATIONS, policy=POLICY, method=request.method)
if not checked.ok:
    return JSONResponse(checked.body, status_code=checked.status)
session = checked.session
```

Where you verify the token without `policy=`, apply the project's rule in the
route that starts your own session with `check_sign_in_rule` (3.3.0 or later),
which gives the same answers. Pass the `POLICY` you warm, or `project_key=` and
it keeps one per project:

```python
from orangecheck import check_sign_in_rule, verify_session

session = verify_session(token, audience="https://your-site.example")
checked = check_sign_in_rule(session, policy=POLICY)
if not checked.ok:
    return JSONResponse(checked.body, status_code=checked.status)
```

It takes only the `Session` that `verify_session` or `check_oc_session` returned
and raises TypeError for claims as a dict, or a Session built any other way:
those could name anyone.

When the token starts your own session, spend its `jti` so it starts only one,
then end it at ochk.io (3.2.0 or later). `store` is yours: anything with an
atomic `add(jti, exp) -> bool` that every server shares, such as a unique row
or Redis `SET NX`. `MemoryJtiStore` is for tests and a single process.

```python
from orangecheck import revoke_token, spend_once

if not spend_once(session.jti, session.exp, store):  # a repeat, or expired
    return JSONResponse({"ok": False, "error": "token_used"}, status_code=401)
start_your_session(session)
revoke_token(token)  # TokensRevoked or RevokeRefusal, never an exception
```

`spend_once_async` takes a store whose `add` is a coroutine (redis.asyncio, an
async ORM). ochk.io ends at most 60 calls a minute per IP: queue a
`RevokeRefusal` (`rate_limited` or `unavailable`) and try again, since the
token stays valid until it expires.

`issuer=` on `verify_session`, `check_oc_session`, `warm_session` and
`revoke_token` names another auth host, such as a test stack's (3.2.0 or
later): keys are fetched from `<issuer>/.well-known/jwks.json`, over https
(http only on localhost). `jwks=` given explicitly wins, and nothing is fetched.

### Sign in from an app on the person's device

A desktop build or a game can't open the popup, and must not carry a secret. It
signs the person in through their browser instead (3.5.0, test projects only for
now): the app listens on `127.0.0.1`, opens ochk.io's `/native/authorize` with a
PKCE challenge, and its listener receives a one-time `code`. The app hands the
code, its verifier and its redirect to your server, which trades them:

```python
from orangecheck import exchange_native_code, spend_once

got = exchange_native_code(
    code,
    code_verifier,
    redirect_uri,  # exactly as the app sent it: http://127.0.0.1:<port>/<path>
    "pk_test_…",
    "https://your-site.example",  # your verified domain, or your test project's dev origin
)
if got.status == "valid" and spend_once(got.session.jti, got.session.exp, store):
    start_your_session(got.session)
```

`got` is a `NativeSignIn` (the token and its session, verified for your
audience, with `azp` `"native"`) or a `NativeRefusal`: `invalid` names why
(`invalid_grant`: start again), and `unavailable` is an outage, so answer it 503.
Each code works once, whatever the answer. The app's half, with a Godot
example, is at ochk.io/docs/integration/native-sign-in.

The full guide is at [ochk.io/docs/sdk/python](https://ochk.io/docs/sdk/python).

## Keep your own login: OC Connect

A site that keeps its own login makes an orangecheck account for its user from
its backend (2.13.0 or later). The Connect API key is on ochk.app, under your
project's **Sign-in → Your own login**.

```python
import os
from orangecheck import connect_provision, CONNECT_CONSENT_LABEL, CONNECT_CONSENT_BLURB

result = connect_provision(os.environ["OCHK_CONNECT_KEY"], user.id)
if result.ok:
    user.did_oc = result.did_oc  # keep it on your user record
# else result.reason: account_deleted, daily_limit, rate_limited, invalid_api_key,
# app_suspended, bad_request or unavailable (an outage or a timeout)
```

A refusal or an outage is a `ConnectRefusal`, never an exception, so it can't
block your own sign-in; a call is given up after `timeout` (5 s, at most 30 s).
Only a mistake in the call raises: an argument it does not take, a missing key or
user id, or `consent=False`.

**With or without asking.** Make the account with no prompt, or show an opt-in
box with `CONNECT_CONSENT_LABEL` and `CONNECT_CONSENT_BLURB`: unticked by default,
never pre-ticked, never bundled with your Terms. Ticked: `consent=True`. Unticked:
make no call at all. A later tick upgrades an account made without asking.
`connect_claim_link` mints a link for your signed-in user to claim their account
at ochk.app; `connect_delete` deletes it when they delete their account with you.
The full guide is at [ochk.io/docs/connect](https://ochk.io/docs/connect).

---

## Configuration

```python
from orangecheck import Client

# Default — hits https://ochk.io
c = Client()

# Self-hosted verifier, custom timeout
c = Client(base_url="https://verifier.mycompany.com", timeout=5.0)

# Reuse an existing httpx Client (connection pooling, auth, etc.)
import httpx
my_session = httpx.Client(proxy="http://proxy.example.com")
c = Client(session=my_session)
```

---

## Types

Every response is a frozen `dataclass` with predictable fields:

```python
@dataclass(frozen=True)
class CheckResult:
    ok: bool
    sats: int
    days: int
    score: float
    attestation_id: str | None
    address: str | None
    identities: tuple[IdentityBinding, ...]
    network: Literal["mainnet", "testnet", "signet"] | None
    reasons: tuple[str, ...]
```

Full type information ships with the package (`py.typed` marker, tested with mypy strict).

---

## Errors

- **`OrangeCheckError`** — base class for everything else.
- **`RateLimitError`** — the hosted API returned 429.
- **`VerificationError`** — `challenge_verify` failed (bad signature, expired, nonce mismatch, …).

`check()` treats 404 (no attestation found) as `CheckResult(ok=False, reasons=("not_found",))` rather than raising — callers should gate on `.ok`, not on try/except.

---

## Shell smoke-test

```bash
python -m orangecheck check --addr bc1q... --min-sats 100000
```

Exits `0` on pass, `2` on fail. Prefer the TypeScript `oc` CLI for richer output; this one is here mostly to verify the install.

---

## License

MIT. The OrangeCheck protocol specifications are MIT too.
