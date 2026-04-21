# `@orangecheck/gate`

**Drop-in sybil-resistance middleware for any Node HTTP framework.**

Wraps the [OrangeCheck SDK](https://www.npmjs.com/package/@orangecheck/sdk)'s `check()` primitive and turns it into a single `next()`-or-`403` decision. No custody. No account. No centralized identity provider.

Use it to gate forums, Nostr relays, airdrops, DAO votes, Discord bots, sign-up flows — anywhere you'd otherwise reach for phone verification or a CAPTCHA.

---

## Install

```bash
yarn add @orangecheck/gate
```

Requires `@orangecheck/sdk` as a peer/transitive dependency (pulled in automatically).

---

## Express / Connect / Next Pages API

```ts
import { ocGate } from '@orangecheck/gate';
import express from 'express';

const app = express();

// Only users with ≥ 100k sats unspent for ≥ 30 days may post.
app.post(
    '/post',
    ocGate({
        minSats: 100_000,
        minDays: 30,
        address: { from: 'header' }, // reads X-OC-Address
    }),
    postHandler
);
```

On block: sends `403 { error, subject, subjectKind, orangecheck? }`. Override with `onBlocked`.

---

## Next.js Pages API wrapper

```ts
import { withOcGate } from '@orangecheck/gate';

async function handler(req, res) {
    // When the gate lets the request through, req.orangecheck is the check result.
    res.json({ sats: req.orangecheck.sats });
}

export default withOcGate(handler, {
    minSats: 100_000,
    minDays: 30,
    address: { from: 'query', name: 'addr' },
});
```

---

## Fetch-style — App Router, Hono, Cloudflare Workers, Bun

```ts
import { ocGateFetch } from '@orangecheck/gate';

export async function POST(req: Request) {
    const decision = await ocGateFetch(req, {
        minSats: 100_000,
        address: { from: 'header' },
    });
    if (!decision.ok) {
        return new Response(JSON.stringify({ error: decision.reason }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    // ... proceed
}
```

---

## Raw primitive — any framework

```ts
import { assertOc } from '@orangecheck/gate';

// Fastify, Hono, tRPC, raw http.createServer, whatever.
const decision = await assertOc(req, {
    minSats: 100_000,
    address: { from: 'header' },
});

if (!decision.ok) {
    return { status: 403, body: { error: decision.reason } };
}
```

---

## Subject sources

You MUST pick exactly one of `address`, `attestationId`, or `identity`. Each one tells the gate _where_ on the request the subject lives:

```ts
// Header (default: X-OC-Address)
ocGate({ address: { from: 'header' } });
ocGate({ address: { from: 'header', name: 'x-my-addr' } });

// Cookie (default: oc_addr)
ocGate({ address: { from: 'cookie' } });

// Query string (default: ocAddr)
ocGate({ address: { from: 'query', name: 'addr' } });

// JSON body (dot-path, default: 'address')
ocGate({ address: { from: 'body', path: 'user.btcAddress' } });

// Custom extractor
ocGate({ address: { from: (req) => req.session?.btcAddress } });
```

Same shape for `attestationId: { ... }` and `identity: { ... }`. Identity values are `protocol:identifier` strings, e.g. `github:alice`.

---

## Options reference

```ts
interface GateOptions {
    // Thresholds (compared against live chain state):
    minSats?: number; // default 0
    minDays?: number; // default 0

    // Pick one:
    address?: SubjectSource;
    attestationId?: SubjectSource;
    identity?: SubjectSource;

    // In-process cache. Matches the /api/check 60s cache by default.
    cacheTtlMs?: number; // default 60_000
    cacheMax?: number; // default 1_000 entries

    // Degrade gracefully when relays are unreachable.
    failOpen?: boolean; // default false — closed by default

    // Override Nostr discovery relays.
    relays?: string[];

    // Hooks.
    onDecision?: (req, decision) => void; // log every decision
    onBlocked?: (req, res, decision) => void; // custom 403 response
}
```

---

## How it works

1. Extract the subject (address / attestation-id / identity) from the request per your `SubjectSource`.
2. Check a small in-process TTL cache — matches `/api/check`'s 60-second cache by default.
3. If not cached, call the SDK's `check()`: find the most recent attestation on Nostr, verify its Bitcoin signature, recompute `sats_bonded` and `days_unspent` from live chain state, compare against your thresholds.
4. Cache the decision. Call `next()` (or return `{ ok: true }`) on pass, send `403` (or your `onBlocked`) on fail.

No state beyond the cache. No secrets. No OrangeCheck server in the path — the SDK talks directly to public Bitcoin explorers and Nostr relays.

---

## Threat model

**What the gate protects against:**

- Mass sybil attacks. Forging N attestations at `N × min_sats × days` of locked Bitcoin is ruinous at scale.
- Throwaway bot accounts. Accounts need real on-chain history.

**What the gate does _not_ protect against:**

- A single determined attacker with a real wallet. The gate raises the cost floor; it does not prevent targeted abuse.
- Identity squatting. A bound `github:alice` is self-asserted inside the signed message. If your app cares about handle ownership, verify out-of-band (gist, DNS, tweet).
- Malicious headers. If your `SubjectSource` is `header` or `query`, you are trusting the client to supply an address they control. For high-stakes gates, prove control with the signed-challenge flow first (see [Signed-challenge auth](#signed-challenge-auth)) and have the gate read the address from the verified session.

---

## Signed-challenge auth

For gates where the address source is untrusted (public header, query string, unsigned cookie), do a one-shot BIP-322 challenge first to prove address control, stash the proven address in a signed session cookie, and have the gate read from there.

```ts
import { issueChallenge, verifyChallenge } from '@orangecheck/sdk';

// Step 1 — issue a challenge
app.get('/auth/challenge', (req, res) => {
    const c = issueChallenge({
        address: req.query.addr,
        ttlSeconds: 300,
        audience: 'https://example.com',
    });
    req.session.ocNonce = c.nonce; // defeat replay on verify
    res.json({ message: c.message });
});

// Step 2 — verify signature
app.post('/auth/verify', async (req, res) => {
    const r = await verifyChallenge({
        message: req.body.message,
        signature: req.body.signature,
        expectedNonce: req.session.ocNonce,
        expectedAudience: 'https://example.com',
    });
    if (!r.ok) return res.status(401).json({ reason: r.reason });
    req.session.verifiedAddress = r.address; // cryptographically proven
    res.json({ ok: true });
});

// Step 3 — gate off the verified session, not the raw client input
app.post(
    '/post',
    ocGate({
        minSats: 100_000,
        address: { from: (req) => req.session.verifiedAddress },
    }),
    handler
);
```

The challenge message uses a distinct `orangecheck-auth` header and `ack` literal; a signed challenge can never be confused with a reputation attestation.

---

## License

MIT. The OrangeCheck protocol is CC-BY-4.0.
