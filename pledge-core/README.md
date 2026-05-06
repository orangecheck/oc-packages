# @orangecheck/pledge-core

Reference TypeScript SDK for the [OC Pledge protocol](https://github.com/orangecheck/oc-pledge-protocol).

OC Pledge is a Bitcoin-anchored, custody-free commitment primitive: a swearer signs a forward-looking proposition (BIP-322), bonds an OrangeCheck attestation to the pledge, and names a pure-function resolution rule that any verifier can evaluate against public state. Outcomes are recorded as separate envelopes; abandonment counts as `broken`. The protocol never holds the bonded sats — enforcement is by public exposure.

This package implements the load-bearing parts of OC Pledge v0.1:

- canonical messages for `pledge`, `pledge-outcome`, and `pledge-abandonment`
- content-addressed ids (`sha256(canonical_message)`)
- create + verify for all three envelope kinds
- bond verification algorithm (§8) — caller injects the chain accessor
- the `§4.4` state machine
- resolution-grammar validation for the seven mechanisms in §3.4
- RFC 8785 envelope canonicalization
- byte-identical conformance against every committed test vector in `oc-pledge-protocol/test-vectors/`

The package does **not** ship a Bitcoin RPC client, a Nostr relay client, an HTTPS fetch client, or a BIP-322 signing/verification implementation — those are caller-supplied adapters so the SDK works in browsers, Node, mobile, and CLIs without imposing a runtime opinion.

> **Status:** v0.1.0-alpha. Tracks `oc-pledge-protocol` v0.1.0-alpha. The first stable release will be v1.0.0 alongside the protocol's stabilization.

## Install

```sh
npm install @orangecheck/pledge-core
# or
yarn add @orangecheck/pledge-core
```

Peer-free except for `@noble/hashes` (SHA-256).

## Quick start — create + verify a pledge

```ts
import { createPledge, verifyPledge } from '@orangecheck/pledge-core';

const env = await createPledge({
    swearer: 'bc1qalice000000000000000000000000000000000',
    proposition: 'I will publish a research preprint with content_hash sha256:e3b0c4… before 2026-09-01.',
    resolution: {
        mechanism: 'stamp_published',
        query: 'stamp(content_hash=sha256:e3b0c4…, signer=bc1qalice…)',
    },
    resolves_at: { time: '2026-09-01T00:00:00Z' },
    expires_at: '2026-09-08T00:00:00Z',
    bond: {
        attestation_id: '<64-hex SHA-256 of an OrangeCheck attestation>',
        min_sats: 1_000_000,
        min_days: 90,
    },
    counterparty: null,
    dispute: { mechanism: null, params: null },
    swearerSigner: {
        address: 'bc1qalice000000000000000000000000000000000',
        signMessage: async (msgHex) => {
            // The `msgHex` argument is the lowercase hex-encoded pledge id.
            // Hand it to your wallet adapter of choice (e.g. bip322-js,
            // sparrow, your own).
            return '<base64 BIP-322 sig>';
        },
    },
});

console.log(env.id);  // 64 lowercase hex chars

const result = await verifyPledge({
    envelope: env,
    verifyBip322: async (msg, sigB64, address) => {
        // Wire your BIP-322 verifier of choice here.
        return true;
    },
});

if (result.ok) {
    console.log('verified', result.id);
} else {
    console.error(result.code, result.message);
}
```

## Outcome envelopes

Deterministic outcome (any of the five non-counterparty mechanisms — `chain_state`, `nostr_event_exists`, `stamp_published`, `http_get_hash`, `dns_record`, `vote_resolves`):

```ts
import { createOutcome } from '@orangecheck/pledge-core';

const outcome = await createOutcome({
    pledge_id: env.id,
    outcome: 'kept',
    resolved_at: '2026-09-15T00:00:00Z',
    resolved_by: 'deterministic',
    evidence: {
        mechanism: 'stamp_published',
        result: 'true',
        witness: 'nostr_event_id=<64-hex>',
    },
    dispute_window_ends_at: '2026-09-22T00:00:00Z',
});
// outcome.sig === null
```

Counterparty-signed outcome:

```ts
const outcome = await createOutcome({
    pledge_id: env.id,
    outcome: 'kept',
    resolved_at: '2026-06-02T10:00:00Z',
    resolved_by: 'bc1qcounter000…',
    evidence: {
        mechanism: 'counterparty_signs',
        result: 'kept',
        witness: 'counterparty_sig=<base64 BIP-322>',
    },
    dispute_window_ends_at: '2026-06-09T10:00:00Z',
    signer: counterpartySigner,  // .address must equal resolved_by
});
```

> **Note (SPEC §4.3 nuance).** `counterparty_signs` outcomes that classify as `expired_unresolved` are deterministic — anyone observes the deadline pass without a counterparty signature — so `resolved_by="deterministic"` and `sig=null` are correct in that case. Test vector `v16` pins this. The SDK keys signature requirements off `resolved_by`, not `mechanism`.

## State machine

```ts
import { classifyState } from '@orangecheck/pledge-core';

const state = classifyState({
    pledge: env,
    outcome: outcomeEnvelope,    // or null
    abandonment: null,
    now: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    chain: { tip_height: 920100, tip_time: '2026-09-15T00:00:00Z' },
});
// state ∈ { pending | resolvable | kept | broken | disputed | expired_unresolved }
```

For block-typed `resolves_at`, supply `chain.tip_height` and `chain.tip_time` so the SDK can decide whether the pledge's resolves block has been mined yet. Without `chain`, block-typed pledges stay `pending` until `expires_at` passes.

## Bond verification

```ts
import { verifyBond } from '@orangecheck/pledge-core';

const r = await verifyBond({
    pledge: env,
    now: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    lookup: async (attestationId, nowIso) => {
        // Resolve the OrangeCheck attestation against live chain state.
        // Return null if not found; otherwise the resolved bond record.
        // This is where you wire your preferred Bitcoin RPC / mempool API.
        return {
            address: 'bc1qalice…',
            sats_bonded: 1_500_000,
            days_unspent: 95,
            utxo_spent_at_or_before_now: false,
        };
    },
});
```

## Resolution-grammar validation

```ts
import { validateResolutionQuery } from '@orangecheck/pledge-core';

const r = validateResolutionQuery(
    'http_get_hash',
    'GET https://example.com/release.tar.gz body_sha256 == ' + 'a'.repeat(64),
);
// r.ok === true
```

The validator catches malformed queries and refused mechanisms (`self_proof`) per SPEC §3.4. It does **not** evaluate queries against public state — that's the caller's job.

## Conformance

`pledge-core` is conformant with `oc-pledge-protocol` v0.1 if:

- canonical messages reconstruct byte-identical from inputs
- ids equal `sha256(canonical_message_bytes)` as 64 lowercase hex
- envelopes round-trip through RFC 8785 canonicalization
- state-transition fixtures produce the named `expected.state`
- bond-verification fixtures produce the named `expected.code`
- malformed-input fixtures raise the named SPEC error code

The conformance harness lives in `src/test-vectors.test.ts` and runs against the 28 vectors committed to `oc-pledge-protocol/test-vectors/`. Set `OC_PLEDGE_VECTORS_DIR` to point at the vectors directory in CI, or check out `oc-pledge-protocol` as a sibling for local dev. As of `0.1.0`, all 28 vectors pass.

## License

MIT.
