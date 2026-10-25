# Changelog

All notable changes to **`@orangecheck/agent-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [2.10.0] — 2026-10-25

### Changed — numbers and methods have one reading (oc-agent-protocol 1.10.0)

- `validateScope`, in strict and permissive mode, refuses a registered integer
  key (`kind`, the `max_*` keys) whose value is not a decimal integer, and a
  `method` value with a lower-case letter. `verifyDelegation`, `verifyAction`,
  `verifyActionAsOfSignedAt` and `verifySubdelegation` return
  `E_BAD_SCOPE_GRAMMAR` for them.
- `isSubScope` compares an integer key's values as integers under `!=`, so
  `kind=00` does not meet `kind!=0`, and returns false under `!=` for a value
  `validateScope` refuses.
- Permissive mode is unchanged: it accepts an unregistered key and applies it
  as a constraint, which SPEC §7.6 now says.

## [2.9.0] — 2026-10-24

### Fixed — a validly signed revocation revokes, whatever is outside its signature

`verifyRevocation`, `verifyFederationRevocation`, and the revocation checks in
`verifyDelegation`, `verifyAction`, `verifyActionAsOfSignedAt` and
`verifyFederationDelegation` decide on the signed bytes only
(oc-agent-protocol 1.9.0):

- The reason's content is not read: a reason outside ASCII, holding a control
  character, or longer than 128 bytes no longer leaves the revocation skipped.
  A reason left out, or `null`, is `""`.
- `v`, `sig.pubkey` and `sig.alg` are not read; the signature is checked
  against `signer.address`, which is signed.
- The id is computed from the signed fields and the signature checked against
  it. A stated `id` that differs, or a `kind` other than `agent-revocation`, is
  a copy: it is flagged and the revocation still revokes. A signature over the
  stated id instead revokes nothing. A revocation's anchor is checked against
  the computed id too.
- A federation revocation stands on M signatures that verify from distinct
  declared guardians. An extra entry that is malformed, unknown, repeated or
  does not verify is passed over, as are `sig.alg` and `sig.threshold`. A
  federation's grant (`verifyFederationDelegation`'s own quorum) stays strict.

### Added — the reason a signer writes, and how a reason is shown

- `authoredReasonProblem(reason)`: SPEC §9.1's rule for signers, printable
  ASCII of at most `REVOCATION_REASON_MAX_BYTES` (128) bytes.
  `@orangecheck/agent-signer` applies it from 0.5.2. No verifier uses it.
- `shownReason(reason)` writes, for display, each control, bidi, invisible or
  line-separating character as an escape (`\n`, `\x07`, `\u{202e}`) and
  drops none. It takes any value: no reason, or one that is not text, reads
  `no reason given`.
- `verifyRevocation` and `verifyFederationRevocation` return `flags`
  (`RevocationFlag[]`): `id_mismatch`, `kind_nonconforming` or
  `reason_nonconforming` where the copy is not as a signer writes it. A flag
  never voids a revocation.

## [2.8.0] — 2026-10-24

### Fixed — a field of the wrong shape is E_MALFORMED

- `verifyDelegation` refuses a `bond` that is not an object or null, and a
  `scopes_encrypted` that is not an object, as `E_MALFORMED`, where it read
  into them before.
- `verifySubdelegation` and the chain walker do the same for a
  sub-delegation's `scopes_encrypted` and `principal`.

### Fixed — every verifier answers with a result for any input

`verifyDelegation`, `verifyAction`, `verifyActionAsOfSignedAt`,
`verifySubdelegation`, `verifyRevocation`, `verifyFederationDelegation` and
`verifyFederationRevocation` check each input before reading it:

- An options object, envelope, action or delegation that is not an object is
  `E_MALFORMED`.
- `revocations` must be a list. An entry that is not an object, or that cites
  the delegation (or a link of the chain) and fails its own check, revokes
  nothing; it is counted in `revocationsSkipped`, new on an `ok` result.
- `subdelegationChain` must be a list of objects.
- An action's `ots` must be `null` or an object with a `status` of `pending`
  or `confirmed`, a text `proof`, and a `block_height` and `block_hash` of
  their type or `null`; `content.mime` must be text.
- The `parent` given to `verifySubdelegation` and the `delegation` given to
  `verifyRevocation` must have the shape of a delegation or a sub-delegation,
  with text scopes.
- Addresses and nonces must be text before they are compared or hashed, and
  a value that is not text is named in a message by its kind.
- `now` must be a valid `Date`, and `content` a `Uint8Array`.
- A federation descriptor's guardians and a federation signature's entries
  must be objects with text addresses, and a federation delegation's `bond`
  an object or `null`.
- A `verifyBip322` callback that throws counts as a signature that does not
  verify (`E_BAD_SIG`).
- `createReplayGuard().firstUse` answers `false` for an action without a text
  `id`, and keeps one whose `signed_at` it cannot read for `maxSkewMs` from
  `now`.

## [2.7.1] — 2026-10-22

### Fixed — the agent may always revoke

oc-agent-protocol 1.8.0, SPEC §9.5.

- `verifyRevocation`, and the revocation lookup in `verifyDelegation` and
  `verifyAction`, accept a revocation signed by the delegation's principal or
  its agent, whatever `revocation.holders` says. Any other signer is
  `E_REVOKER_UNAUTHORIZED`.
- `verifyRevocationOf` (federation) accepts the agent's revocation on the same
  terms.

## [2.7.0] — 2026-10-21

### Changed — `verifyAction` checks as of the time of verification

oc-agent-protocol 1.7.0, SPEC §8.1 steps 6–7 and §8.3 step 11a.

- `verifyAction` takes `now` (default: the current time). Every link of the
  chain, root and sub-delegations, must be in force at `now`
  (`E_NOT_YET_VALID`, `E_EXPIRED`).
- A valid revocation of any link that is in effect at or before `now` refuses
  the action with `E_REVOKED`, whatever `signed_at` the action carries. One
  in effect only after the action's `signed_at` (SPEC §9.3) still refuses it.
- `signed_at` must lie within `maxSkewMs` of `now`, either way (default
  `DEFAULT_MAX_SKEW_MS`, 120 s). Otherwise the result is the new code
  `E_STALE`.
- The ok result carries `asOf: { basis: 'now', now }`.

### Added

- `verifyActionAsOfSignedAt(input)` audits a past action as of its own
  `signed_at`, with no freshness bound. Its result carries
  `asOf: { basis: 'signed_at', signedAt, anchored }`; `anchored` is false
  unless a verified OTS anchor fixes that time.
- `createReplayGuard(maxSkewMs?)` remembers accepted action ids for as long as
  they could pass `verifyAction`.
- `DEFAULT_MAX_SKEW_MS`, the `E_STALE` error code, and the
  `VerifyActionAsOfSignedAtInput` type.

### Migrating

- A server deciding whether to act on an action keeps calling `verifyAction`,
  and adds a replay check: `createReplayGuard`, or the same record in its own
  store.
- A tool that shows past actions (an inspector, an audit log) calls
  `verifyActionAsOfSignedAt` and shows `asOf.anchored`.
- The conformance harness runs a vector with `verified_at` live at that time,
  and every other action vector as an audit.

## [2.6.0] — 2026-10-21

### Changed — a delegation longer than 365 days is malformed

oc-agent-protocol 1.6.1 (errata) says where SPEC §4.4's window is checked:
§8.1 step 2, the shape check, with `E_MALFORMED`. `verifyDelegation` and
`verifyFederationDelegation` now reject `expires_at - issued_at` over 365 days
(31,536,000 seconds), `expires_at` not after `issued_at`, and a timestamp that
is shaped right but is no real time. The check runs whatever the clock says,
so it also holds when `skipTemporalCheck` is set, which is how `verifyAction`
checks its delegation. The message is
`expires_at is more than 365 days after issued_at (SPEC §4.4)`.

Before this, a strict verifier and this one disagreed on the same bytes.
`@orangecheck/agent-signer` never creates such a delegation, so only an
envelope made elsewhere is affected. Spec vectors v15–v17, which broke the
rule, are fixed in 1.6.1; v27 (366 days) is rejected and v28 (365 days)
accepted.

### Added — tests for scope values keeping their case

oc-agent-protocol 1.6.2 rewords SPEC §7.2 to what this package has always
done: values are kept exactly as written. New tests fail if canonicalization
ever folds case.

## [2.5.1] — 2026-10-20

### Fixed — the revocation refusal names a query relays answer

`verifyDelegation`, `verifyAction` and `verifyFederationDelegation` refuse
without `revocations` or `skipRevocationCheck: true`, and the refusal told
callers to fetch kind 30085 "by #delegation". Relays do not index that tag;
most reject the filter outright. The message now names
`"#t": [delegation id]`, per oc-agent-protocol 1.4.1 SPEC §9.4 and §10.4.
The doc comments on `revocations` say the same, and that `[]` means a relay
answered with EOSE and nothing matched.

### Fixed — the README quickstart runs

It called `verifyDelegation` without `revocations`, so it failed with
`E_MALFORMED` on every version since 2.0.0. Its `as const` envelope did not
type-check against `DelegationEnvelope`, and its fixed dates had expired. It
now fetches revocations by `#t` with `@orangecheck/nostr-core`, verifies with
`@orangecheck/bip322`, and dates the delegation from now. The install section
no longer calls `stamp-core` a peer dependency; it is a dependency.

## [2.5.0] — 2026-10-19

### Added — the adapter scopes are registered

oc-agent-protocol 1.4.0 registers the scopes the agent-stack adapters
exercise: `anthropic:tool(name=…)`, `openai:function(name=…)`,
`vercel:tool(verb=…)` and `langgraph:tool(verb=…)`. Strict mode, the default,
rejected them as unknown scopes, so their envelopes verified only with
`scopeMode: 'permissive'`. Values stay case-sensitive.

## [2.4.0] — 2026-10-08

### Changed — `verifyFederationDelegation` checks revocation

It takes `revocations` (federation revocations, and agent self-revocations
when `revocation.holders` includes "agent") and returns `E_REVOKED` for a
revoked delegation. Without `revocations` or an explicit
`skipRevocationCheck: true` it refuses, as `verifyDelegation` has since 2.0.0.
Shipped as a minor so the `^2` range picks it up.

### Changed — an unwalked action anchor is `claimed`

`verifyAction` reports a confirmed `ots` block it did not verify as
`{ status: 'claimed', verified: false }`. `confirmed` now always carries
`verified: true`.

## [2.3.0] — 2026-09-24

### Added — `pledge:create` is a registered scope

oc-pledge-protocol SPEC §7.3 defines `pledge:create` with the constraint keys
`max_bond_sats`, `mechanism` and `counterparty`, and OC Agent SPEC §7.3 / §7.6
now registers it. Strict mode rejected it as unregistered, so a delegation
carrying it failed `E_BAD_SCOPE_GRAMMAR` unless the caller verified in
permissive mode. `max_bond_sats` compares numerically, like the other `max_*`
keys.

## [2.2.0] — 2026-09-24

### Fixed — the principal is always an authorised revoker

SPEC §9.5. `revocation.holders` is not part of the delegation's canonical
message (§4.1), so it cannot restrict who revokes. The principal (the link's
`principal.address`) is now always an authorised revoker; `holders` can only add
the agent.

### Fixed — revocation priority uses only verified anchors

SPEC §9.3. An envelope's `ots` is outside its signature, so an anchor orders
an action against a revocation only once its proof is checked against that
envelope's id.

- `verifyOtsAnchor(proofB64, blockHeight, blockHash, envelopeId)` receives the
  envelope id, the same shape as `@orangecheck/stamp-core`, and runs before the
  revocation check, for the action and for each revocation.
- An anchor counts for priority only if that call returns true. Without a
  verifier, anchors are ignored for priority.
- Both anchors verified: revoked iff the revocation's block ≤ the action's.
  Action not verifiably anchored and the revocation claims an anchor: revoked.
  Otherwise the signed times decide, revoked iff revocation `signed_at` ≤ action
  `signed_at`.

`anchor.verified` in the result now reflects the same bound check.

### Changed — `verifyFederationRevocation` takes the revoked delegation

FEDERATION.md §4. The function now requires `delegation` and checks that
`delegation_id` matches it (`E_DELEGATION_MISMATCH`) and that the signing
federation is that delegation's principal (`E_REVOKER_UNAUTHORIZED`). This is a
new required input; no published package calls the function.

## [2.1.0] — 2026-09-14

### Fixed — ordered-op constraint values are now parsed as decimal integers

SPEC §7.4: "values MUST be decimal integers for ordered ops". `opToRange` used
`Number()`, which is far looser and accepted `1e3`, `0x3e8`, `+1000`,
`" 1000 "` and `1.5` — and `""`, which becomes `0`, turning an empty constraint
into a silent zero bound nobody wrote.

A verifier using a strict decimal parser rejects every one of those, so the same
delegation bytes produced different accept/reject answers on different
implementations. SECURITY §5 requires that they not: "same inputs on different
implementations MUST produce the same accept/reject answer."

Now `/^-?\d+$/` plus a safe-integer bound. Checked the conformance vectors
first: no vector uses a non-decimal ordered-op value, and the one that looks
like it (`max_bytes<=abc` in v09) is the malformed-scope vector that expects
rejection anyway.

## [2.0.0] — 2026-09-14

### Security — revocation checking was opt-IN, and the spec says opt-OUT

**BREAKING.** SECURITY §7 item 7: "Query revocation feeds (Nostr kind-30085 by
`#delegation`) for the cited delegation id before reporting OK, **unless the
caller explicitly opts out** of revocation checking."

The default was inverted:

- `verifyDelegation` had **no revocations parameter at all**. A revoked
  delegation returned `ok: true`, and a caller who wanted the check had no way
  to ask for it.
- `verifyAction` accepted `revocations` and evaluated them correctly, but only
  `if (input.revocations && length > 0)`. Omitting them skipped the check
  silently, so "checked, clean" and "never checked" were the same result, and
  `VerifyActionOkExtra` carried no revocation-status field to tell them apart.

Both verifiers now refuse unless given `revocations` or an explicit
`skipRevocationCheck: true`. An empty array is a valid, meaningful answer — "I
queried the feed and there were none" — and is distinct from declining to look.

This library has no network by design, so the caller still fetches the feed.
What changed is that declining to is a decision they must state, rather than
something that happens by omission. Same shape as vote-core's refusal to tally
without a signature verifier and pledge-core's refusal to verify an outcome
without the pledge.

`verifyDelegation` also now actually evaluates the revocations it is handed,
returning `E_REVOKED`. `verifyAction` continues to evaluate the whole chain
against the action's effective time; its internal `verifyDelegation` call
forwards `skipRevocationCheck: true` deliberately, because a per-link check
there would use the wrong clock and double-report.

## [Unreleased]

- _(no pending changes)_

## [1.1.0] — reconstructed 2026-09-04

**Reconstructed from the published artifacts.** 1.0.0 and 1.1.0 shipped to npm
with no CHANGELOG entry, and the gap had a cost: six `agent-*` adapters still
pin `^0.1.0` or `^0.3.0`, and a caret on a `0.x` version locks the MINOR, so
none of them can resolve 1.x. Nobody bumping them could tell what would break.
The entries below were derived by unpacking 0.1.0, 1.0.0 and 1.1.0 from npm and
diffing `dist/index.d.ts` and `dist/types.d.ts`, so they describe the shipped
surface rather than anyone's recollection.

### Added

- **Federation principal — M-of-N guardian authority.** `FederationPrincipal`
  (`alg: 'federation'`) carrying a `FederationDescriptor` (`kind:
  'agent-federation'`, a `threshold` string, and a `guardians` array of
  `FederationGuardian`), plus `FederationSignature` (`alg:
  'federation-bip322'`) holding one `{ guardian_address, value }` per signing
  guardian. A delegation can now be authorised by a threshold of guardians
  rather than a single address.

## [1.0.0] — reconstructed 2026-09-04

### Changed — BREAKING

- **`scopes` is now optional: `scopes?: string[]`,** alongside a new
  `scopes_encrypted?: ScopesEncryptedEnvelope`. A delegation may carry its
  scope list sealed instead of in the clear, so the plaintext field is absent
  in that case.

  **This is the change that breaks consumers, and the fix is not a `?? []`.**
  An adapter that maps over `delegation.scopes` to check a scope is within the
  grant gets `undefined` and must **refuse** — absent scopes mean "encrypted,
  and you did not supply a key", never "no restrictions". `oc-packages/agent-mcp`
  has exactly this shape at `src/index.ts`, and treating an absent list as an
  empty or universal grant would turn an authorisation check into a no-op.

  To read sealed scopes, pass `decryptScopesWith: { device_id, secretKey }` to
  `verifyDelegation` / `verifyAction` / `verifySubdelegation`.

- **`VerifyDelegationResult.delegation` is a `ChainLink`,** not a
  `DelegationEnvelope` — it may now be one link in a subdelegation chain.

### Added

- **Subdelegation.** `SubdelegationEnvelope`, `verifySubdelegation`,
  `SubdelegationCanonicalInput`, `computeSubdelegationId`,
  `subdelegationCanonicalBytes` / `subdelegationCanonicalMessage`, and
  `ChainLink`. `verifyDelegation` / `verifyAction` accept
  `subdelegationChain?: SubdelegationEnvelope[]` and `maxChainDepth?: number`,
  bounded by `DEFAULT_MAX_CHAIN_DEPTH = 5`.
- **Encrypted scopes.** `ScopesEncryptedEnvelope`, and a dependency on
  `@orangecheck/lock-core` for the seal / unseal primitives.

## [0.1.0] — Initial published state

Initial public release. Canonical delegation + action envelope format, scope parser, BIP-322 verifier.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-agent-core-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-agent-core-v0.1.0
