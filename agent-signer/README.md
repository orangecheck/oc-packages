# @orangecheck/agent-signer

> **Full reference:** [docs.ochk.io/sdk/agent-signer](https://docs.ochk.io/sdk/agent-signer) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


High-level API for producing [OC Agent](https://github.com/orangecheck/oc-agent-protocol) envelopes from a BIP-322-capable signer.

Three functions:

| | |
|---|---|
| `createDelegation(input)` | Principal signs a scoped grant for an agent address. |
| `signAsAgent(input)` | Agent produces an `agent-action` envelope over content, citing the delegation. |
| `revoke(input)` | Principal (or agent, if authorized) burns the delegation. |

The signer layer wraps [`@orangecheck/agent-core`](../agent-core): canonical messages, scope canonicalization, envelope ids, and verification are delegated to the core package. This module handles wallet plumbing, default timestamps and nonces, and input validation.

Nothing here touches the network — OpenTimestamps submission and Nostr publication are separate steps. If you already have an OTS proof, pass it in via the `ots` field; otherwise the resulting envelope has `ots: null` and the caller submits to a calendar out of band.

## Install

```bash
npm i @orangecheck/agent-signer
```

## Quickstart

```ts
import {
    createDelegation,
    signAsAgent,
    revoke,
} from '@orangecheck/agent-signer';

// A SignerRef is any { address, signMessage } — the wallet adapter produced by
// @orangecheck/wallet-adapter, or a custom BIP-322 signer for headless agents.
const principal = {
    address: 'bc1qprincipal…',
    signMessage: async (msg: string) => wallet.signMessage(msg),
};
const agent = {
    address: 'bc1qagent…',
    signMessage: async (msg: string) => agentKey.signBip322(msg),
};

// 1. Principal grants the agent scoped authority.
const delegation = await createDelegation({
    principal,
    agentAddress: agent.address,
    scopes: [
        'lock:seal(recipient=bc1qalice)',
        'stamp:sign(mime=text/markdown)',
    ],
    bond: { sats: 500_000, attestation_id: '22…22' },
    ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
});

// 2. Agent exercises the delegation.
const action = await signAsAgent({
    agent,
    delegation,
    content: new TextEncoder().encode('hello world'),
    mime: 'text/plain',
    scopeExercised: 'lock:seal(recipient=bc1qalice)',
});

// 3. Principal revokes early (optional).
const revocation = await revoke({
    signer: principal,
    delegation,
    reason: 'key rotated',
});
```

## API

### `createDelegation(input)`

```ts
interface CreateDelegationInput {
    principal: SignerRef;
    agentAddress: string;
    scopes: string[];                 // validated + canonicalized
    bond?: { sats: number; attestation_id: string } | null;
    issuedAt?: Date;                   // default: now
    ttlMs?: number;                    // default: 7d, max: 365d
    expiresAt?: Date;                  // overrides ttlMs if set
    nonce?: string;                    // default: random 32-hex
    revocationHolders?: ('principal' | 'agent')[]; // default: ['principal']
    revocationRef?: string | null;
    scopeMode?: 'strict' | 'permissive'; // default: 'strict'
}
```

Returns a `DelegationEnvelope`. The principal's `signMessage` is called exactly once with the ASCII hex of the envelope id.

### `signAsAgent(input)`

```ts
interface SignAsAgentInput {
    agent: SignerRef;                 // must equal delegation.agent.address
    delegation: DelegationEnvelope;
    content: Uint8Array | { hash: string; length: number };
    mime: string;
    scopeExercised: string;           // must be a sub-scope of some granted scope (checked at verify time)
    ref?: string | null;
    signedAt?: Date;                  // default: now
    ots?: ActionOts | null;           // default: null (caller submits separately)
}
```

Returns an `ActionEnvelope` — a strict extension of an [OC Stamp](https://github.com/orangecheck/oc-stamp-protocol) envelope, so any stamp verifier reads it as a valid stamp.

### `revoke(input)`

```ts
interface RevokeInput {
    signer: SignerRef;                 // must be in delegation.revocation.holders
    delegation: DelegationEnvelope;
    reason?: string;                   // ASCII, <=128 bytes
    signedAt?: Date;
    ots?: ActionOts | null;
}
```

Returns a `RevocationEnvelope`. The function throws if the signer isn't authorized to revoke per `delegation.revocation.holders`.

## Verification

Re-exports `verifyDelegation`, `verifyAction`, and `verifyRevocation` from `@orangecheck/agent-core` for convenience. See that package's README for full details.

## Companion packages

- [`@orangecheck/agent-core`](../agent-core) — canonical messages, scopes, verification.
- [`@orangecheck/agent-mcp`](../agent-mcp) — MCP tool wrapper.
- [`@orangecheck/wallet-adapter`](../wallet-adapter) — browser BIP-322 signers (UniSat, Xverse, Leather).

## License

MIT. See [LICENSE](./LICENSE).
