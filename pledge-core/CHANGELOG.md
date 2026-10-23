# Changelog

All notable changes to **`@orangecheck/pledge-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.


## [3.3.0] — 2026-10-23

### Changed — an agent pledge needs no signer from the principal

`CreatePledgeInput` is now one of two shapes. `CreateDirectPledgeInput` takes
`swearerSigner`, whose address must equal `swearer`. `CreateDelegatedPledgeInput`
takes `viaDelegation` and needs nothing from the principal: the swearer is the
`swearer` address. `swearerSigner` stays accepted on the agent path, deprecated,
and its address must equal `swearer`. `createPledge` refuses, with
`E_PLEDGE_MALFORMED` and before anything is signed, a direct pledge with no
signer or one whose signer is not the swearer (`verifyPledge` already refused
such an envelope, SPEC §3.6), and checks the agent against `swearer` rather than
against the signer. `CreatePledgeTerms` names the fields the two shapes share.
The test script also type-checks `*.test-d.ts`.

## [3.2.2] — 2026-10-22

### Fixed — an agent pledge's agent is never its swearer

SPEC §7.3, §11.12. `via_delegation` and `agent_address` are not in the pledge
id. `verifyPledge` refuses an envelope whose `agent_address` equals
`swearer.address` (`E_PLEDGE_MALFORMED`), before any delegation lookup, as
`createPledge` already did. Vector `v33`.

## [3.2.1] — 2026-10-22

### Fixed — a signed outcome dated after expires_at comes too late

SPEC §3.4.2, §4.4, §11.10. A counterparty that signs after `expires_at` has let
the pledge expire unresolved. `verifyOutcome`, given the pledge, refuses a signed
outcome whose `resolved_at` is at or after `expires_at` (`E_OUTCOME_MALFORMED`),
and `classifyState` leaves it out, so the pledge stays `expired_unresolved`.
Deterministic outcomes are exempt: anyone can compute one after expiry.
`resolved_at` is the counterparty's own claim, so this catches only an honestly
dated late outcome. Vector `v32`.

## [3.2.0] — 2026-10-22

### Changed — an agent pledge is checked as of the time of verification

SPEC §7.3, §11.12.

- `verifyPledge` takes `now` (default: the current time). The delegation lookup
  is asked as of `now`, not as of `sworn_at`, and the delegation must still be
  unexpired then (`E_DELEGATION_EXPIRED`). Step 5, `expires_at > sworn_at`,
  still applies. The agent chooses `sworn_at`, so it no longer decides whether
  the delegation was in force.
- The ok result carries `asOf: { basis: 'now', now }`.
- A `DelegationLookup` receives that time as `nowIso`. Return null for a
  delegation that a valid revocation in effect by then has ended.

### Changed — an outcome dated after `now` does not classify a pledge yet

SPEC §4.4. `classifyState` leaves out an outcome, or a contradicting one, whose
`resolved_at` is later than `now`. Vector `v31`.

### Added

- `verifyPledgeAsOfSwornAt(input)` checks a past pledge as of its own
  `sworn_at`, for a history. Its result carries
  `asOf: { basis: 'sworn_at', swornAt, anchored: false }`.
- The `VerifyPledgeAsOfSwornAtInput` type.

### Migrating

- A site deciding whether a pledge counts keeps calling `verifyPledge`. An agent
  pledge whose delegation has since expired or been revoked now fails it.
- A history that still wants to show such a pledge calls
  `verifyPledgeAsOfSwornAt` and says the time is unanchored.
- A lookup that ignored `nowIso` should check the delegation, and revocations,
  as of it.

## [3.1.2] — 2026-10-19

### Fixed — a bond's age is that of the coins covering `min_sats`

`verifyBond` passes `pledge.bond.min_sats` to the lookup as a third argument,
`coverSats`, and `days_unspent` is the age of the coins that cover it: the
address's confirmed outputs oldest first until they reach `coverSats`, aged by
the youngest of them (SPEC §8, as in OC Attest SPEC §7 step 5.d). With
`@orangecheck/sdk` that is `verify(…, { coverSats })` or
`check({ minSats: coverSats })`. A lookup that ignores the argument still
type-checks, so check yours. Conformance runs the spec's `v29` and `v30`.

## [3.1.1] — 2026-09-24

### Fixed — `counterparty=null` scope

REGISTRY.md defines `pledge:create(counterparty=null)` as "only pledges with no
counterparty". The value was compared as the string `"null"`, so no pledge ever
satisfied it.

## [3.1.0] — 2026-09-24

### Changed — `pledge:create` ceilings use `<=`; unknown constraints do not match

SPEC §7.3 now writes the bond ceiling `max_bond_sats<=N`, OC Agent's range
operator; in OC Agent `=` is an exact match. `parsePledgeCreateScope` reads
both forms as the ceiling, so delegations issued with `max_bond_sats=N` keep
verifying. Before, `<=` was split at its `=`, which produced the key
`max_bond_sats<` and left the ceiling unchecked.

`checkPledgeCreateScope` now fails a scope that carries a constraint key other
than `max_bond_sats`, `mechanism` or `counterparty`, uses an operator other
than `=` (or `<=` on the ceiling), repeats a key, or gives a ceiling that is
not a whole number. A constraint the verifier cannot evaluate cannot be shown
to hold. Quoted values are unquoted.

## [3.0.0] — 2026-09-24

### Changed — abandonments, deterministic outcomes and agent pledges bind to the pledge

**BREAKING.** Four SPEC rules are now enforced by the verifiers rather than left
to callers.

**`verifyAbandonment` takes the pledge (SPEC §5.3).** `VerifyAbandonmentInput`
gains `pledge`. With it, the abandonment must name that pledge (`pledge_id`
recomputed), `sig.pubkey` must be the pledge's `swearer.address`
(`E_ABANDONMENT_BAD_SIG`), and `abandoned_at >= sworn_at`
(`E_ABANDONMENT_MALFORMED`). Omitting `pledge` is an error unless the caller
passes `skipPledgeBinding: true`, which states that the result says nothing
about who abandoned what.

**Deterministic outcomes are bound claims (SPEC §4.3, §9.1 step 8, §11.4).**
With `pledge` supplied, `verifyOutcome` requires `evidence.mechanism` to equal
the pledge's mechanism (`E_OUTCOME_EVIDENCE_MISMATCH`, every mechanism), and a
`"deterministic"` outcome must be dated at or after a time-typed `resolves_at`,
and an `expired_unresolved` one at or after `expires_at` (`E_OUTCOME_MALFORMED`).
`VerifyOutcomeOk` gains `recomputeRequired`: `true` for every deterministic
outcome. Such an outcome is unsigned, so verification shows it is well formed
and bound to the pledge, not that public state agrees; callers MUST recompute
the mechanism before treating it as final.

**`classifyState` ignores envelopes about another pledge (SPEC §4.4).** An
outcome, contradictory outcome or abandonment whose `pledge_id` is not
`pledge.id` is treated as absent, as is an abandonment whose `sig.pubkey` is not
the swearer.

**Agent pledges require a delegation lookup (SPEC §7.3).** `verifyPledge`
returns `E_DELEGATION_NOT_FOUND` for a `via_delegation` pledge when no
`delegationLookup` is supplied, unless the caller passes
`skipDelegationVerification: true`. The agent's signature alone does not show
that the swearer authorised the pledge.

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
