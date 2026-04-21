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

## Configuration

```python
from orangecheck import Client

# Default — hits https://ochk.io
c = Client()

# Self-hosted verifier, custom timeout
c = Client(base_url="https://verifier.mycompany.com", timeout=5.0)

# Reuse an existing httpx Client (connection pooling, auth, etc.)
import httpx
my_session = httpx.Client(proxies="http://proxy.example.com")
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

MIT. The OrangeCheck protocol is CC-BY-4.0.
