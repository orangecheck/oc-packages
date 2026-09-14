# Changelog

All notable changes to **`@orangecheck/pledge-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.


## [2.1.0] — 2026-09-14

### Fixed — two §3 field rules were declared and never enforced

**`resolution.query` must match its mechanism's grammar.** The grammar validator
existed in `resolution.ts` and had exactly ONE non-test caller family-wide — a
UI playground. Nothing on the create or verify path consulted it, so only the
MECHANISM was checked and any query string at all was accepted: `chain_state`
with `"q"` was signable and verified clean. A pledge whose resolution nobody can
evaluate is not a pledge — the entire claim is that a stranger can decide the
outcome without asking the swearer.

Consequence of the gap beyond malformed pledges: because `verifyPledge` never
called it, neither `E_RESOLUTION_UNKNOWN` nor `E_RESOLUTION_NONDETERMINISTIC`
was reachable from any verification path. Both now surface through
`validatePledgeInput`, which `createPledge`, `wrapPledgeEnvelope` and
`verifyPledge` all run.

**`expires_at >= resolves_at` when both are time-typed.** Only the ISO format
was checked, so a pledge that expired BEFORE it could resolve was signable and
verified clean — it can never be kept, only run out. The bound is inclusive
(vector v09 is the deliberate same-time edge case) and does not apply to a
block-typed `resolves_at`, which has no wall clock to compare against.

All 11 protocol test vectors were checked against both rules before enforcing:
every one already conforms.

## [2.0.0] — 2026-09-12

### Security — `verifyOutcome` never checked who was entitled to resolve a pledge

**BREAKING.** `verifyOutcome` checked only that `sig.pubkey === resolved_by` —
self-consistency — and never compared the resolver against the pledge. SPEC §1
says the resolver of a `counterparty_signs` pledge IS the named counterparty,
and `VerifyOutcomeInput` had no pledge field, so that comparison was impossible
to make.

Proven end to end against the published 1.0.0 — both shapes verified clean and
classified a stranger's pledge as `broken`:

- an outcome naming an unrelated address as `resolved_by`, signed by that same
  address (BIP-322 passes, because the forger owns that key);
- an outcome with `resolved_by: "deterministic"` and `sig: null`, requiring
  **no key material at all**.

Public exposure is this protocol's entire enforcement mechanism, so a forged
`broken` on someone else's pledge is the attack — and it needed nothing but the
victim's pledge id.

`VerifyOutcomeInput` gains `pledge`, and `verifyOutcome` now enforces two
bindings: the outcome names THIS pledge (`pledge_id` recomputed, never trusted),
and the resolver is the one §1 names for that mechanism — the counterparty for
`counterparty_signs`, the literal `"deterministic"` otherwise. Violations return
`E_OUTCOME_RESOLVER_UNAUTHORIZED`, the code SPEC §10 and SECURITY §6 already
named and which nothing emitted.

**Fails closed.** Omitting `pledge` is an error unless the caller passes
`skipResolverAuthorization: true` — the same shape as vote-core's refusal to
tally without a signature verifier. Legitimate skips are narrow: the conformance
vectors carry a `pledge_id` but no pledge object, and a UI may verify a pasted
envelope in isolation. Such a caller has checked shape and signature, not
authority, and must not present the result as authentic.

### Added — `pledgeCanonicalInputFromEnvelope`

The envelope-to-canonical-input projection existed in three hand-rolled copies
(verifyPledge plus two components in oc-pledge-web). One transcription slip
there is a verifier that disagrees with the signer about what was signed.
