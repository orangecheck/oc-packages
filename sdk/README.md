# `@orangecheck/sdk`

**Proof of Bitcoin stake for the open web.**

A sybil-resistance primitive for forums, Nostr relays, airdrop gates, DAO votes, and any open platform that needs to filter bots without KYC. Bitcoin UTXOs are the only credible signal of commitment: honest users pay nothing, attackers pay real opportunity cost.

No custody. No account. No permission. The SDK is MIT; the protocol is open forever.

---

## Install

```bash
yarn add @orangecheck/sdk
```

---

## The 30-second integration

### 1. Gate any action with one call

```ts
import { check } from '@orangecheck/sdk';

// "Only let this user post if they have 100k sats unspent for 30 days."
const result = await check({
    addr: 'bc1q...',
    minSats: 100_000,
    minDays: 30,
});

if (result.ok) {
    // let them through
} else {
    console.log('rejected:', result.reasons); // e.g. ['below_min_sats']
}
```

`check()` finds the most recent attestation for the subject, verifies the Bitcoin signature, recomputes sats + days from live chain state, and compares against your thresholds. One call.

### 2. Or call the hosted API — no SDK needed at all

```bash
curl "https://attest.ochk.io/api/check?addr=bc1q...&min_sats=100000&min_days=30"
# { "ok": true, "sats": 125000, "days": 47, "score": 30.12, ... }
```

Same logic, zero dependencies. Useful from any language, any runtime, any shell script.

### 3. Verify a raw attestation (no Nostr round-trip)

```ts
import { verify } from '@orangecheck/sdk';

const outcome = await verify({
    addr: 'bc1q...',
    msg: canonicalMessage, // the exact signed text
    sig: signature,
    scheme: 'bip322',
});

if (outcome.ok) {
    console.log(outcome.metrics); // { sats_bonded, days_unspent, score }
}
```

Use this when you already hold the `(addr, msg, sig)` tuple — e.g., a user pasted it into your UI, or you're verifying an offline proof.

---

## Express / Next middleware

Want drop-in route-gating? Use [`@orangecheck/gate`](https://www.npmjs.com/package/@orangecheck/gate) (wraps this SDK):

```ts
import { ocGate } from '@orangecheck/gate';

app.post('/post', ocGate({ minSats: 100_000, minDays: 30 }), handler);
```

The gate expects the caller to pass `?ocAddr=...` (or a signed header) carrying their address. See the gate's README for signature schemes.

---

## Signed-challenge auth (proving address control)

For gates that can't trust the address source — e.g. when the client sends the address in a public header or query string — prove control first with a short-lived BIP-322 challenge. The proven address goes into a signed session cookie or JWT, and the gate reads from there.

```ts
// --- Server: issue a challenge ---
// --- Client: ask the user's wallet to sign c.message with BIP-322 ---

// --- Server: verify ---
import { issueChallenge, verifyChallenge } from '@orangecheck/sdk';

app.get('/auth/challenge', (req, res) => {
    const c = issueChallenge({
        address: req.query.addr,
        ttlSeconds: 300,
        audience: 'https://example.com', // optional origin binding
        purpose: 'login', // optional label
    });
    // Remember the nonce against the session so we can defeat replay on verify.
    req.session.ocNonce = c.nonce;
    res.json({ message: c.message, nonce: c.nonce, expiresAt: c.expiresAt });
});

app.post('/auth/verify', async (req, res) => {
    const { message, signature } = req.body;
    const r = await verifyChallenge({
        message,
        signature,
        expectedNonce: req.session.ocNonce,
        expectedAudience: 'https://example.com',
        expectedPurpose: 'login',
    });

    if (!r.ok) return res.status(401).json({ reason: r.reason });

    // r.address is cryptographically proven. Stash it on the session.
    req.session.verifiedAddress = r.address;
    res.json({ ok: true, address: r.address });
});
```

The challenge message uses a distinct `orangecheck-auth` header and `ack` literal, so a signed auth challenge can never be confused with a reputation attestation. Pair with `@orangecheck/gate` like so:

```ts
app.post(
    '/post',
    ocGate({
        minSats: 100_000,
        address: { from: (req) => req.session.verifiedAddress },
    }),
    handler
);
```

Now the gate doesn't have to trust the client — the address it sees has been cryptographically proven earlier in the session.

---

## Creating an attestation (issuer side)

If you're building a wallet, a Nostr client, or a settings page where users should be able to _create_ a proof, use:

```ts
import { buildCanonicalMessage, createAttestation, publishAttestation } from '@orangecheck/sdk';

// 1. Build the canonical message
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

// 2. Hand to the user's wallet (BIP-322)
const signature = await userWallet.signMessage(message);

// 3. Package into an attestation envelope
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

// 4. Optional: publish to Nostr for decentralized discovery
await publishAttestation({ envelope, npub: userNpub });

// envelope.attestation_id is the content-addressed SHA-256 of the message —
// share it as a URL, embed, or QR.
```

---

## What an attestation proves

| Claim                              | Strength            | How a verifier checks                  |
| ---------------------------------- | ------------------- | -------------------------------------- |
| You control address `bc1q…`        | Cryptographic       | BIP-322 signature verification         |
| The address holds `N` sats         | On-chain, trustless | Live query to mempool.space / Esplora  |
| The bonded UTXO is `N` days old    | On-chain, trustless | Confirmation time compared to now      |
| You claim to be `@alice` on GitHub | **Self-asserted**   | Out-of-band (gist, DNS TXT, tweet URL) |

`verify()` covers the first three. The fourth is up to the relying party — use `verifyIdentity()` for structured out-of-band checks on Nostr, GitHub, DNS, and Twitter.

---

## Identity verification (optional)

```ts
import { verifyIdentity } from '@orangecheck/sdk';

const result = await verifyIdentity(
    envelope.attestation_id,
    { protocol: 'github', identifier: 'alice' }
    // Optional: pass { relays } for 'nostr', { tweetUrl } for 'twitter'.
);

if (result.verified) {
    // the GitHub gist contains the attestation ID → handle ownership proven
}
```

Identity bindings are self-asserted inside the signed message. They are **claims**, not proofs. Always verify out-of-band before honoring them.

---

## Scoring

The reference algorithm is intentionally simple:

```
score_v0 = round( ln(1 + sats_bonded) * (1 + days_unspent / 30), 2 )
```

This is **advisory**. Relying parties should compare `sats_bonded` and `days_unspent` against their own thresholds rather than trusting a displayed score. `check()` does exactly that.

---

## API surface (the short list)

```ts
// Load-bearing — start here.
check(params: CheckParams): Promise<CheckResult>
verify(input: VerifyInput, options?: VerifyOptions): Promise<VerifyOutcome>
createAttestation(options: CreateAttestationOptions): Promise<AttestationEnvelope>

// Signed-challenge auth (proving address control).
issueChallenge(options): Challenge
verifyChallenge(options): Promise<VerifyChallengeResult>

// Building blocks.
buildCanonicalMessage(...)
generateAttestationId(msg: string): Promise<string>
publishAttestation({ envelope, npub, relays? })
discoverAttestations({ attestationId | address | identity, relays? })
verifyIdentity(attestationId, { protocol, identifier }, options?)
```

Full type definitions ship with the package.

---

## Guarantees

- **No custody.** The SDK never touches user funds. It signs messages, it doesn't spend coins.
- **No telemetry.** The SDK makes network calls only to public Bitcoin explorers (mempool.space, blockstream.info) and Nostr relays you pass in. No OrangeCheck server is in the path for `verify()`.
- **Offline-verifiable.** Given `(addr, msg, sig)`, anyone — including you, sitting on an island with a Raspberry Pi — can verify.

---

## License

MIT. The protocol is CC-BY-4.0.

## Links

- **Website**: https://ochk.io
- **Protocol spec**: https://ochk.io/protocol
- **API docs**: https://attest.ochk.io/docs
- **Hosted verifier**: `https://attest.ochk.io/api/check`
