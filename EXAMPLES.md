# OrangeCheck — Integration Examples

**Proof of Bitcoin stake for the open web.** Working examples for the shapes you'll actually ship.

---

## Contents

1. [The one-call gate](#the-one-call-gate)
2. [Express / Connect middleware](#express--connect-middleware)
3. [Next.js — Pages API](#nextjs--pages-api)
4. [Next.js — App Router](#nextjs--app-router)
5. [Fastify](#fastify)
6. [Hono / Cloudflare Workers / Bun](#hono--cloudflare-workers--bun)
7. [Raw HTTP — `curl`, shell, any language](#raw-http--curl-shell-any-language)
8. [Creating a proof from a wallet](#creating-a-proof-from-a-wallet)
9. [Verifying a raw attestation offline](#verifying-a-raw-attestation-offline)
10. [Publishing to Nostr](#publishing-to-nostr)
11. [Identity verification — out-of-band handle checks](#identity-verification--out-of-band-handle-checks)
12. [Signed-challenge auth — proving address control](#signed-challenge-auth--proving-address-control)

---

## The one-call gate

The load-bearing integration. From a server, decide whether to let a request through:

```ts
import { check } from '@orangecheck/sdk';

const decision = await check({
    addr: 'bc1q...',
    minSats: 100_000, // at least 100k sats bonded
    minDays: 30, // unspent for at least 30 days
});

if (decision.ok) {
    // let them through
} else {
    // decision.reasons tells you why: ['below_min_sats'], ['not_found'], etc.
}
```

`check()` discovers the most recent attestation for the subject via Nostr, verifies the Bitcoin signature, recomputes sats + days from live chain state, and compares against your thresholds. That's the whole flow.

You can also look up by attestation ID or identity binding:

```ts
await check({ id: 'a3f5b8c2…', minSats: 100_000 });
await check({ identity: { protocol: 'github', identifier: 'alice' }, minSats: 50_000 });
```

---

## Express / Connect middleware

```ts
import { ocGate } from '@orangecheck/gate';
import express from 'express';

const app = express();
app.use(express.json());

// Only users with 100k sats unspent for 30 days may post.
app.post(
    '/post',
    ocGate({
        minSats: 100_000,
        minDays: 30,
        address: { from: 'header' }, // reads X-OC-Address
    }),
    async (req, res) => {
        res.json({ success: true });
    }
);
```

**On block:** sends `403 { error, subject, subjectKind, orangecheck? }`. Override with `onBlocked`.

---

## Next.js — Pages API

Two equivalent patterns. Pick the one that fits your file layout.

### With the middleware function

```ts
// pages/api/post.ts
import type { NextApiHandler } from 'next';

import { ocGate } from '@orangecheck/gate';

const gate = ocGate({
    minSats: 100_000,
    minDays: 30,
    address: { from: 'query', name: 'addr' },
});

const handler: NextApiHandler = async (req, res) => {
    await new Promise<void>((resolve, reject) => {
        gate(req, res, (err) => (err ? reject(err) : resolve()));
    });
    if (res.writableEnded) return; // gate already sent 403
    res.status(200).json({ ok: true });
};

export default handler;
```

### With the wrapper (cleaner)

```ts
// pages/api/post.ts
import { withOcGate } from '@orangecheck/gate';

async function handler(req, res) {
    // req.orangecheck is the passing CheckResult
    res.json({ sats: req.orangecheck.sats });
}

export default withOcGate(handler, {
    minSats: 100_000,
    minDays: 30,
    address: { from: 'query', name: 'addr' },
});
```

---

## Next.js — App Router

```ts
// app/api/post/route.ts
import { ocGateFetch } from '@orangecheck/gate';

export async function POST(req: Request) {
    const decision = await ocGateFetch(req, {
        minSats: 100_000,
        minDays: 30,
        address: { from: 'header' },
    });

    if (!decision.ok) {
        return new Response(JSON.stringify({ error: decision.reason }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // ... proceed with the request
    return Response.json({ ok: true, sats: decision.check?.sats });
}
```

---

## Fastify

```ts
import { assertOc } from '@orangecheck/gate';
import Fastify from 'fastify';

const app = Fastify();

app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/protected')) return;
    const decision = await assertOc(req.raw, {
        minSats: 100_000,
        address: { from: 'header' },
    });
    if (!decision.ok) {
        reply.code(403).send({ error: decision.reason });
    }
});

app.post('/protected/post', async () => ({ ok: true }));
app.listen({ port: 3000 });
```

---

## Hono / Cloudflare Workers / Bun

```ts
import { ocGateFetch } from '@orangecheck/gate';
import { Hono } from 'hono';

const app = new Hono();

app.use('/protected/*', async (c, next) => {
    const decision = await ocGateFetch(c.req.raw, {
        minSats: 100_000,
        address: { from: 'header' },
    });
    if (!decision.ok) return c.json({ error: decision.reason }, 403);
    c.set('orangecheck', decision.check);
    await next();
});

app.post('/protected/post', (c) => c.json({ ok: true }));

export default app;
```

Same code runs unchanged on Cloudflare Workers, Bun, Deno, or Node.

---

## Raw HTTP — `curl`, shell, any language

```bash
curl -s "https://ochk.io/api/check?addr=bc1q...&min_sats=100000&min_days=30"
```

Response:

```json
{
    "ok": true,
    "sats": 125000,
    "days": 47,
    "score": 30.12,
    "attestation_id": "a3f5b8c2…",
    "address": "bc1q...",
    "identities": [
        { "protocol": "nostr", "identifier": "npub1alice…" },
        { "protocol": "github", "identifier": "alice" }
    ],
    "network": "mainnet"
}
```

Use it from Python, Go, Rust, Ruby — anywhere. No SDK needed. Cached 60 seconds by the server.

---

## Creating a proof from a wallet

```ts
import { buildCanonicalMessage, createAttestation, publishAttestation } from '@orangecheck/sdk';

// 1. Build the canonical message (strict format).
const message = buildCanonicalMessage(
    {
        address: 'bc1q...',
        identities: [
            { protocol: 'nostr', identifier: 'npub1alice...' },
            { protocol: 'github', identifier: 'alice' },
        ],
    },
    {
        bond: '1000000', // 1M sats
        expires: '2027-01-15T12:00:00Z', // optional
    }
);

// 2. Ask the user's wallet to sign (BIP-322).
//    Works with Sparrow, Electrum, Bitcoin Core, UniSat, Xverse, Leather, ...
const signature = await userWallet.signMessage(message);

// 3. Package into a self-contained JSON envelope.
const envelope = await createAttestation({
    message,
    signature,
    scheme: 'bip322',
    address: 'bc1q...',
    identities: [
        { protocol: 'nostr', identifier: 'npub1alice...' },
        { protocol: 'github', identifier: 'alice' },
    ],
});

// 4. Optional: publish to Nostr relays.
await publishAttestation({ envelope, npub: userNpub });

console.log('Attestation ID:', envelope.attestation_id); // content-addressed
console.log('Share at:', `https://ochk.io/a/${envelope.attestation_id}`);
```

---

## Verifying a raw attestation offline

When you already hold the `(addr, msg, sig)` tuple — no Nostr round-trip needed.

```ts
import { verify } from '@orangecheck/sdk';

const outcome = await verify({
    addr: 'bc1q...',
    msg: canonicalMessage,
    sig: signature,
    scheme: 'bip322',
});

if (outcome.ok) {
    const { sats_bonded, days_unspent, score } = outcome.metrics!;
    console.log('Valid. Sats:', sats_bonded, 'Days:', days_unspent, 'Score:', score);
} else {
    console.log('Invalid:', outcome.codes);
    //   e.g. ['sig_invalid']  or  ['bond_insufficient']  or  ['expired']
}
```

---

## Publishing to Nostr

```ts
import { DEFAULT_RELAYS, publishAttestation } from '@orangecheck/sdk';

const result = await publishAttestation({
    envelope,
    npub: userNpub,
    relays: [...DEFAULT_RELAYS, 'wss://relay.mycompany.com'],
});

console.log('Published to:', result.success);
console.log('Failed:', result.failed);
```

Events are kind `30078` parameterized replaceable events per NIP-78. The `d` tag is `orangecheck:<attestation_id>` so future events with the same ID replace the old one.

### Discovery

```ts
import { getAttestationsForAddress, getAttestationsForIdentity } from '@orangecheck/sdk';

// All proofs for an address:
const byAddr = await getAttestationsForAddress('bc1q...');

// All proofs bound to a handle:
const byGh = await getAttestationsForIdentity('github', 'alice');
```

---

## Identity verification — out-of-band handle checks

Bindings inside a signed message are **claims**, not proofs. If you care about handle ownership, verify independently:

```ts
import { verifyIdentity } from '@orangecheck/sdk';

const result = await verifyIdentity({
    protocol: 'github',
    identifier: 'alice',
    attestationId: envelope.attestation_id,
    proof: 'https://gist.github.com/alice/abc123',
});

if (result.verified) {
    // the gist contains the attestation ID → handle ownership proven
}
```

Supported protocols: `nostr`, `github`, `dns`, `twitter`. Each has its own proof shape:

- **`nostr`** — look for a Nostr event from the claimed npub containing the attestation ID.
- **`github`** — look for a public gist or repo file at the claimed user containing the attestation ID.
- **`dns`** — look for a TXT record at `_orangecheck.<domain>` containing the attestation ID.
- **`twitter`** — user supplies a public tweet URL containing the attestation ID.

---

## Signed-challenge auth — proving address control

`check()` and the gate both need a Bitcoin address to work with. If that address arrives on a public header or query string, you're trusting the client to supply one they control. For high-stakes gates (airdrop eligibility, payment-authorized posting), prove control first with a short-lived BIP-322 challenge.

### Issue and verify — hosted API

The simplest path: just call the hosted endpoints.

```bash
# 1. Get a challenge to sign
curl -s "https://ochk.io/api/challenge?addr=bc1q...&audience=https://example.com&purpose=login"
# → { "message": "orangecheck-auth\naddress: ...\nnonce: ...\n...",
#     "nonce": "a1b2...", "expiresAt": 1747584000000 }

# 2. User signs the message in their wallet (BIP-322).

# 3. Send the signature back.
curl -s -X POST "https://ochk.io/api/challenge" \
  -H 'Content-Type: application/json' \
  -d '{"message": "...", "signature": "..."}'
# → { "ok": true, "address": "bc1q...", "nonce": "a1b2...", "expiresAt": ... }
```

### Issue and verify — SDK

```ts
// Server step 3 — gate on the verified session, not raw client input
import { ocGate } from '@orangecheck/gate';
import { issueChallenge, verifyChallenge } from '@orangecheck/sdk';

// Server step 1 — issue
app.get('/auth/challenge', (req, res) => {
    const c = issueChallenge({
        address: req.query.addr,
        ttlSeconds: 300,
        audience: 'https://example.com',
        purpose: 'login',
    });
    req.session.ocNonce = c.nonce; // defeat replay
    res.json({ message: c.message });
});

// Server step 2 — verify
app.post('/auth/verify', async (req, res) => {
    const r = await verifyChallenge({
        message: req.body.message,
        signature: req.body.signature,
        expectedNonce: req.session.ocNonce,
        expectedAudience: 'https://example.com',
        expectedPurpose: 'login',
    });
    if (!r.ok) return res.status(401).json({ reason: r.reason });
    req.session.verifiedAddress = r.address; // cryptographically proven
    res.json({ ok: true });
});

app.post(
    '/post',
    ocGate({
        minSats: 100_000,
        address: { from: (req) => req.session.verifiedAddress },
    }),
    handler
);
```

### Why this flow

- **Distinct wire format.** The challenge message starts with `orangecheck-auth`, not `orangecheck`, so a signed session challenge can never be confused with a reputation attestation.
- **Short TTL.** Default 5 minutes. Long enough for a hardware wallet; short enough that a stolen message can't be replayed days later.
- **Bound to audience + purpose + nonce.** The signer authorizes _this_ application, _this_ action, _this_ session. An authenticator app can see exactly what's being signed.
- **No custody shift.** Same guarantee as the rest of OrangeCheck — funds never move, keys never leave the wallet.

---

## Design notes

- **Bitcoin is load-bearing.** If you find yourself using a code path that would work identically on Ed25519, you're in the wrong part of the SDK. The unique value prop is the on-chain economic signal.
- **RPs validate raw metrics.** Never gate access on `score_v0` alone — score is advisory. Compare `sats_bonded` and `days_unspent` against your own policy.
- **Handles are claims, not proofs.** The BIP-322 signature proves _address control_, not handle ownership. Verify handles out-of-band when it matters.
- **Rotate addresses for privacy.** Each proof links the address to the bound handles. Use fresh single-purpose addresses per proof if linkability is a concern.

---

## More

- [Protocol spec](https://ochk.io/protocol)
- [`/api/check` reference](https://ochk.io/docs)
- [`@orangecheck/sdk` README](sdk/README.md)
- [`@orangecheck/gate` README](gate/README.md)
