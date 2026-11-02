# @orangecheck/agent-core

> **Full reference:** [ochk.io/docs/sdk/agent-core](https://ochk.io/docs/sdk/agent-core) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


Canonical messages, envelope formats (delegation / action / revocation), scope grammar, and verification for [OC Agent](https://github.com/orangecheck/oc-agent-protocol) — the OrangeCheck authority primitive.

- **Pure TypeScript.** No Node built-ins outside `@noble/hashes`. Runs in Node, browsers, Deno, Cloudflare Workers.
- **Spec-conformant.** Loads the `test-vectors/` directory of `oc-agent-protocol` and asserts byte-identical canonical messages and ids.
- **Stamp-compatible.** The agent-action envelope is a strict extension of `@orangecheck/stamp-core`; this package re-exports its canonical-JSON serializer and hex utilities for shared semantics.

## Install

```bash
npm i @orangecheck/agent-core
# for the quickstart below: relay reads and a BIP-322 verifier
npm i @orangecheck/nostr-core @orangecheck/bip322
```

## Quickstart

```ts
import {
    canonicalizeScopes,
    computeDelegationId,
    verifyDelegation,
    type DelegationEnvelope,
    type RevocationEnvelope,
} from '@orangecheck/agent-core';
import { verifySignature } from '@orangecheck/bip322';
import { DEFAULT_RELAYS, queryEvents, type NostrEvent } from '@orangecheck/nostr-core';

// 1. Build a delegation's canonical fields and id.
const iso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, 'Z');
const issued = new Date();
const scopes = canonicalizeScopes([
    'lock:seal(recipient=bc1qalice)',
    'stamp:sign(mime=text/markdown)',
]);
const canon = {
    principal: 'bc1qprincipal…',
    agent: 'bc1qagent…',
    scopes,
    bond_sats: 500_000,
    bond_attestation: '22…22', // 64-hex OrangeCheck attestation id, or 'none'
    issued_at: iso(issued),
    expires_at: iso(new Date(issued.getTime() + 7 * 86_400_000)), // one week
    nonce: '0123…cdef', // 32-hex, random
};
const id = computeDelegationId(canon);

// 2. Have the principal's wallet sign `id` (hex ASCII) via BIP-322.
const sigValue = await wallet.signMessage(id);

// 3. Build the wire envelope.
const envelope: DelegationEnvelope = {
    v: 1, kind: 'agent-delegation', id,
    principal: { address: canon.principal, alg: 'bip322' },
    agent: { address: canon.agent, alg: 'bip322' },
    scopes,
    bond: { sats: canon.bond_sats, attestation_id: canon.bond_attestation },
    issued_at: canon.issued_at, expires_at: canon.expires_at, nonce: canon.nonce,
    revocation: { holders: ['principal'], ref: null },
    sig: { alg: 'bip322', pubkey: canon.principal, value: sigValue },
};

// 4. Fetch its revocations: kind 30085 by `#t` (SPEC §9.4). Relays do not
//    index the multi-letter `delegation` tag. One REQ is not enough: anyone
//    can publish under the tag, and a relay answers newest first up to its
//    cap, so page each relay with `until` until a page comes back short. "No
//    revocation" stands only when at least the read floor of the relays asked
//    (those asked, less 2, plus 1, and never fewer than 1: four of five)
//    answered in full and none was cut off (SPEC §10.4); otherwise the check
//    is unchecked, never unrevoked.
const PAGE = 500;
const reads = await Promise.all(
    DEFAULT_RELAYS.map(async (relay) => {
        const seen = new Map<string, NostrEvent>();
        let until: number | undefined;
        for (let page = 0; page < 4; page++) {
            const r = await queryEvents({ kinds: [30085], '#t': [id], limit: PAGE, ...(until ? { until } : {}) }, [relay]);
            const s = r.relayStatus[0];
            const before = seen.size;
            for (const e of r.events) seen.set(e.id, e);
            if (!s?.eose) return { events: [...seen.values()], cutOff: s ? s.events + s.rejected > 0 || seen.size > 0 : false, full: false };
            if (s.events + s.rejected < PAGE) return { events: [...seen.values()], cutOff: false, full: true };
            if (seen.size === before) break; // a full page stuck on one second
            until = Math.min(...r.events.map((e) => e.created_at));
        }
        return { events: [...seen.values()], cutOff: true, full: false };
    })
);
const floor = Math.max(1, DEFAULT_RELAYS.length - 2 + 1);
if (reads.filter((r) => r.full).length < floor || reads.some((r) => r.cutOff)) {
    throw new Error('revocations unchecked: too few relays answered in full, or one was cut off');
}
const revocations = reads.flatMap((r) => r.events).flatMap((e): RevocationEnvelope[] => {
    try {
        const r = JSON.parse(e.content);
        return r?.kind === 'agent-revocation' && r.delegation_id === id ? [r] : [];
    } catch {
        return [];
    }
});

// 5. Verify. `revocations` is required: pass what you fetched, or state
//    `skipRevocationCheck: true` if you are not checking.
const result = await verifyDelegation({
    envelope,
    revocations,
    verifyBip322: async (msg, sig, addr) => verifySignature(addr, msg, sig),
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

- `verifyDelegation({ envelope, revocations | skipRevocationCheck, verifyBip322, now?, skipTemporalCheck?, scopeMode? })`
- `verifyAction({ action, delegation, revocations | skipRevocationCheck, verifyBip322, now?, maxSkewMs?, verifyOtsAnchor?, content?, resolveAnchorBlockHeight?, scopeMode? })` — the live check, as of `now` (default: the current time). Every link of the chain must be in force at `now`, a revocation in effect at or before `now` refuses the action (`E_REVOKED`), and `signed_at` must lie within `maxSkewMs` of `now` (default 120 s; else `E_STALE`). The result's `asOf` is `{ basis: 'now', now }`.
- `verifyActionAsOfSignedAt({ … })` — an audit of a past action, as of its own `signed_at`. The agent chooses that time, so `asOf.anchored` says whether a verified OTS anchor fixes it. Never use it to decide whether to act now.
- `createReplayGuard(maxSkewMs?)` — `firstUse(action, now?)` is true once per action id. It keeps each id until `signed_at + maxSkewMs`, as long as the action could pass `verifyAction`. One process only; across instances keep the same record in a shared store. Replay is the caller's to stop: `verifyAction` keeps no state.
- `verifyRevocation({ envelope, delegation, verifyBip322 })` — the principal and the agent may always revoke; `revocation.holders` is informational
- `verifyOtsAnchor(proofB64, blockHeight, blockHash, envelopeId)` — an anchor orders an action against a revocation only when this returns true
- `verifyFederationRevocation({ envelope, delegation, verifyBip322 })`
- Revocation reasons. SPEC §9.1: a signer writes printable ASCII, at most `REVOCATION_REASON_MAX_BYTES` = 128 bytes, `""` when there is none. A verifier never reads the reason to decide; a validly signed revocation revokes whatever it holds.
  - `authoredReasonProblem(reason)` is the signer's rule: `null`, or `'not_text'`, `'not_ascii'`, `'control_character'`, `'too_long'`. Check a reason with it before you sign one. No verifier uses it.
  - `shownReason(reason)` writes each control, bidi, invisible or line-separating character, and the backslash, as an escape (`\n`, `\x07`, `\u{202e}`, `\\`) for a person to read. It drops nothing, and takes any value: no reason reads `no reason given`.

A revocation revokes when its signature and its revoker check out against the signed bytes. Nothing outside them decides: not the reason's content, not `v`, `id`, `kind`, `sig.pubkey` or `sig.alg`, and, for a federation, not an extra bad or repeated entry beside M valid signatures from distinct guardians. The id is computed from the signed fields; `verifyRevocation` returns it, with `flags` naming any copy that differs. A federation's grant stays strict.

`verifyDelegation`, `verifyAction` and `verifyFederationDelegation` refuse with `E_MALFORMED` unless you pass `revocations` or `skipRevocationCheck: true`. Fetch revocations with `{ kinds: [30085], "#t": [<delegation id>] }`; for an action under a sub-delegation chain, list every link's id. Pass `[]` only when at least the read floor of the relays asked (those asked, less 2, plus 1, and never fewer than 1: four of five) answered in full, each read paged with `until` to a page shorter than its `limit`, no relay was cut off, and nothing matched (SPEC §10.4). EOSE after a full page is no answer. Otherwise the revocation check has not been performed: report it as unchecked, never as unrevoked. You may pass what the relays sent unfiltered: an entry that is not an object, or that cites the envelope and fails its own check, revokes nothing and is counted in `revocationsSkipped` on an `ok` result.

Every verifier answers with a result whatever it is given, and does not throw: an input of the wrong shape is `E_MALFORMED`, and a `verifyBip322` callback that throws counts as a signature that does not verify.

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
