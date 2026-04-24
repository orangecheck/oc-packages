# @orangecheck/agent-core

Canonical messages, envelope formats (delegation / action / revocation), scope grammar, and verification for [OC Agent](https://github.com/orangecheck/oc-agent-protocol) — the OrangeCheck authority primitive.

- **Pure TypeScript.** No Node built-ins outside `@noble/hashes`. Runs in Node, browsers, Deno, Cloudflare Workers.
- **Spec-conformant.** Loads the `test-vectors/` directory of `oc-agent-protocol` and asserts byte-identical canonical messages and ids.
- **Stamp-compatible.** The agent-action envelope is a strict extension of `@orangecheck/stamp-core`; this package re-exports its canonical-JSON serializer and hex utilities for shared semantics.

## Install

```bash
npm i @orangecheck/agent-core
# peer dep:
npm i @orangecheck/stamp-core
```

## Quickstart

```ts
import {
    canonicalizeScopes,
    computeDelegationId,
    delegationCanonicalMessage,
    verifyDelegation,
} from '@orangecheck/agent-core';

// 1. Build a delegation canonical message.
const scopes = canonicalizeScopes([
    'lock:seal(recipient=bc1qalice)',
    'stamp:sign(mime=text/markdown)',
]);
const canon = {
    principal: 'bc1qprincipal…',
    agent: 'bc1qagent…',
    scopes,
    bond_sats: 500_000,
    bond_attestation: '22…22', // 64-hex OrangeCheck attestation id
    issued_at: '2026-04-22T12:00:00Z',
    expires_at: '2026-04-29T12:00:00Z',
    nonce: '0123…cdef',
};
const msg = delegationCanonicalMessage(canon);
const id = computeDelegationId(canon);

// 2. Have the wallet sign `id` (hex ASCII) via BIP-322.
const sigValue = await wallet.signMessage(id);

// 3. Build the wire envelope.
const envelope = {
    v: 1, kind: 'agent-delegation', id,
    principal: { address: canon.principal, alg: 'bip322' },
    agent: { address: canon.agent, alg: 'bip322' },
    scopes,
    bond: { sats: canon.bond_sats, attestation_id: canon.bond_attestation },
    issued_at: canon.issued_at, expires_at: canon.expires_at, nonce: canon.nonce,
    revocation: { holders: ['principal'], ref: null },
    sig: { alg: 'bip322', pubkey: canon.principal, value: sigValue },
} as const;

// 4. Verify.
const result = await verifyDelegation({
    envelope,
    verifyBip322: async (m, s, a) => bip322.verify(a, m, s),
});
if (!result.ok) throw new Error(result.code + ': ' + result.message);
```

## API surface

### Canonical messages + ids

- `delegationCanonicalMessage(input)`
- `actionCanonicalMessage(input)`
- `revocationCanonicalMessage(input)`
- `computeDelegationId(input) -> string`
- `computeActionId(input) -> string`
- `computeRevocationId(input) -> string`
- `canonicalizeDelegation(envelope) -> string` (RFC 8785 + scope sort)
- `canonicalizeAction(envelope)`, `canonicalizeRevocation(envelope)`

### Scope grammar (§SPEC 7)

- `parseScope(s) -> Scope` — throws `ScopeParseError` on invalid input
- `canonicalizeScope(scope)` / `canonicalizeScopeString(s)` — constraints sorted by key
- `canonicalizeScopes(scopes[])` — sort constraints, then sort list
- `validateScope(scope, { mode: 'strict' | 'permissive' })`
- `isSubScope(exercised, granted) -> boolean` — SPEC §7.4
- `REGISTERED_SCOPES` — MVP registry of 8 product/verb pairs and their constraint keys

### Verification (§SPEC 8)

- `verifyDelegation({ envelope, verifyBip322, now?, skipTemporalCheck?, scopeMode? })`
- `verifyAction({ action, delegation, revocations?, verifyBip322, verifyOtsAnchor?, content?, resolveAnchorBlockHeight?, scopeMode? })`
- `verifyRevocation({ envelope, delegation, verifyBip322 })`

Each returns a discriminated union:

```ts
type Result = { ok: true; envelope: T; id: string; canonicalMessage: string; /* extras */ }
            | { ok: false; code: AgentErrorCode; message: string };
```

`AgentErrorCode` covers every code in SPEC §11 (`E_BAD_SIG`, `E_SCOPE_DENIED`, `E_REVOKED`, etc.).

## Types

All wire types are in `./types` — `DelegationEnvelope`, `ActionEnvelope`, `RevocationEnvelope`, `DelegationBond`, `ActorRef`, `Signature`, plus canonical-message input types.

## Conformance

The `src/test-vectors.test.ts` suite loads `oc-agent-protocol/test-vectors/*.json` and asserts:

1. Canonical message reconstructs byte-identical.
2. SHA-256 of canonical message equals declared `id`.
3. Declared envelope passes `verifyDelegation` / `verifyAction` / `verifyRevocation` with `skipSignatureVerification: true`.

New language implementations should mirror this harness.

## Companion packages

- [`@orangecheck/agent-signer`](../agent-signer) — `createDelegation()`, `signAsAgent()`, `revoke()`. Adds the wallet-adapter plumbing and OTS anchor submission.
- [`@orangecheck/agent-mcp`](../agent-mcp) — MCP tool wrapper that stamps every invocation as an agent-action.
- [`@orangecheck/stamp-core`](../stamp-core) — OC Stamp base. `agent-core` depends on this for the canonical JSON serializer.

## License

MIT. See [LICENSE](./LICENSE).
