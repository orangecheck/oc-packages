# Changelog

All notable changes to **`@orangecheck/auth-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [2.4.0] — 2026-05-18 · display_identity claim

Adds the `display_identity` session claim — the identity a user has
chosen to surface as their account-badge label across every `.ochk.io`
subdomain. Same posture as `name` / `npub`: baked into the JWT so the
choice renders consistently with no network round-trip.

- `SessionPayload.display_identity?: DisplayIdentity | null` — `{ kind, value }`
  where `kind ∈ {did,btc,email,nostr}` and `value` is the full renderable
  value. Only the *promoted* identity's value is ever carried, so an
  unrelated email never enters the token.
- New exports: `DisplayIdentity`, `DisplayIdentityKind`,
  `DISPLAY_IDENTITY_KINDS`, and `resolveDisplayIdentity(payload)` — a
  total resolver that returns the claim when well-formed and falls back
  to `{ kind:'did', value:did_oc }` otherwise (pre-field tokens, malformed
  claims). Both `<OcAccountMenu>` and integrators building their own chip
  should resolve through this.
- `signSession()` accepts `display_identity` in its claims argument.

Additive — older tokens (no claim) resolve cleanly to the did.

## [2.2.0] — 2026-05-14 · Inline sudo-mode claim

Additive · all v2.1.x consumers keep working unchanged. New
`sudo_at?: number` claim on `SessionPayload` carries the unix seconds
when the user last successfully re-authenticated inline (email-OTP for
email-primary identities, BIP-322 challenge for btc-primary identities)
on the auth host. New `verifySudoClaim(payload, { max_age_secs })`
helper · same shape as `verifyStepUpClaim`, independent claim.

Replaces the hostile 1-hour fresh-`iat` gate previously protecting
WebAuthn key registration. Sensitive auth-graph-mutating operations
(register an additional hardware key, revoke a key, link a new
identity, generate recovery codes, change recovery method) gate on
`verifySudoClaim` instead of a full re-signin.

`signSession` claims now accept `sudo_at?: number` (omitted when
undefined, so existing tokens mint byte-identically).

## [2.1.0] — 2026-05-14 · WebAuthn step-up surface

Additive · all v2.0.0 consumers continue to verify unchanged. New
`step_up_at?: number` claim on `SessionPayload` carries the unix
seconds when the user last completed a WebAuthn assertion on the
auth host. New `verifyStepUpClaim(payload, { max_age_secs })` helper
is the single source of truth for "is this session freshly stepped
up." Consumer subdomains gating sensitive actions (spend > 1M sats,
project_key creation, etc.) read it both before triggering
`useStepUpAuth()` and again server-side after JWT verify.

`signSession`'s `claims` type now accepts `merged_from?: string[]`
and `step_up_at?: number`. Existing callers that don't pass them
mint identical tokens (omitted claims, not null-valued).

See `AUTH-OVERVIEW.md` §6 + `AUTH-TODO.md` §6 in the workspace for
the broader design. The matching auth-client hooks ship in
`@orangecheck/auth-client` v2.1.0 the same day.

## [0.1.0] — Initial published state

Initial public release. Crypto-only Ed25519 JWT verify + cookie helpers — the consumer half of the ochk.io auth host stack.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-auth-core-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-auth-core-v0.1.0
