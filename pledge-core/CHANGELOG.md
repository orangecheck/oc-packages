# Changelog

All notable changes to **`@orangecheck/pledge-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.


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
