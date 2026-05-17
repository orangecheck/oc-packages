# Changelog

All notable changes to **`@orangecheck/auth-client`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [2.7.0] — 2026-05-16 · `OcIdentityBond` — publish a Binding Attestation

Additive. `<OcLinkedIdentities>` now offers the self-sovereign tier of
identity linking — publishing a v1 Binding Attestation, the mutually-signed
BTC ⇄ Nostr identity bond (`oc-attest-protocol` SPEC-BINDING.md).

- New `<OcIdentityBond>` component — also rendered automatically by
  `<OcLinkedIdentities>` when the account has a linked Bitcoin address. The
  ceremony is two keys: the Bitcoin wallet signs the canonical message via
  BIP-322, then a NIP-07 Nostr extension counter-signs by publishing the
  artifact as a kind-30079 event. The assembled bond is self-verified
  before publishing.
- `@orangecheck/sdk` (`>=1.2.0` — construct + verify) and
  `@orangecheck/nostr-core` (publish) join `@orangecheck/wallet-adapter` as
  lazy-loaded optional peers. A site without them, or a user without a
  NIP-07 extension, degrades to a clear message.

No breaking changes.

## [2.6.0] — 2026-05-16 · `OcLinkedIdentities` + `OcSignIn` linkPrompt

Additive. Identity linking is no longer a single-product, one-tab
feature — it ships as a shared component every family site can mount.
See AUTH-PLAN.md §5.

- **New `<OcLinkedIdentities/>`** — the shared linked-identities
  management surface: lists the user's linked email + Bitcoin address,
  reveal/hide per row, unlink a non-primary identity, link a new one.
  Linking an identity already on another OC account offers the
  dual-proof transfer (BTC and — new on the auth host — email). Renders
  consolidated (`merged_from`) accounts. Style-agnostic inline styling,
  CSS-variable-themed, same approach as `OcSignIn`. Calls the auth host
  directly with family-CORS; no local proxy route needed.
- **New `linkPrompt` prop on `OcSignIn`** — when set, after a
  successful sign-in the component shows an optional "add a backup way
  to sign in" step (`<OcLinkedIdentities/>`) before navigating away,
  instead of navigating immediately. The sign-in ceremony is the
  lowest-friction moment to bind a recovery identity. Ignored when
  `onSuccess` is provided. Default off.

`@orangecheck/wallet-adapter` (already an optional peer) is lazy-loaded
by the Bitcoin-link path — sites without it degrade gracefully with a
clear message. No breaking changes.

## [2.5.1] — 2026-05-16 · `OcSignIn` onSuccess forwards the session token

Additive. `OcSignIn`'s `onSuccess` callback now receives the session
JWT as a second argument: `(account, token?) => void`. The token was
always in the auth-host response — it just wasn't forwarded.

This is what lets the popup sign-in surface (`/popup/signin`, opened by
a cross-domain integrator) `postMessage` `{ account, token }` back to
its opener without a bespoke ceremony fork: a cross-domain integrator
can't read the HttpOnly `.ochk.io` cookie, so it needs the token to
verify the session via JWKS. With this, `OcSignIn` covers the popup
case too and the last hand-rolled sign-in fork can be deleted.

Existing `onSuccess` callbacks that ignore the second argument are
unaffected — purely additive.

## [2.5.0] — 2026-05-16 · `OcSignIn` ceremony as the single source of truth

Additive. `OcSignIn` gains two changes so that every site can render it
verbatim instead of hand-rolling the dual-path sign-in ceremony — the
fork-collapse step of the auth holistic plan (`AUTH-PLAN.md` §4).

- **New `resolveReturnTo?` prop** — `(account) => string | Promise<string>`.
  When provided (and `onSuccess` is not), the component awaits it after a
  successful sign-in and hard-navigates to the result. This is the seam
  for persona-aware routing — e.g. me.ochk.io resolves `/api/me/intent`
  and routes to `/me/developer` | `/me/operator` | `/me` — so a site no
  longer needs to fork the ceremony to customize post-sign-in navigation.
  The resolved value is open-redirect-checked exactly like `returnTo`;
  a resolver throw falls back to the static `returnTo`.
- **iOS-zoom fix** — sign-in text inputs were `font-size: 13px`, which
  triggers iOS Safari's focus auto-zoom. Bumped to `16px` (the family
  minimum for every form field). Desktop is unaffected visually.

No breaking changes. Consumers on `^2.x` pick this up with no code edits.

## [2.3.0] — 2026-05-14 · `useWebAuthnList.{rename,remove}` discriminated unions

Breaking shape change to two hook methods · same pattern that landed for
`register` / `stepUp` in v2.1.1. The bare `boolean` / `null` return left
the failure reason in the hook's `error` state, unreadable by the caller
post-await because of React closure semantics.

New shapes:

```ts
rename(id, label) → Promise<{ ok: true; credential } | { ok: false; reason }>;
remove(id)        → Promise<{ ok: true } | { ok: false; reason }>;
```

Consumers branch on `result.ok` and read `result.reason` directly. The
hook's `error` field stays for debug; the awaited return is now the
source of truth.

The package is days old and the only known consumer (me-web's
`HardwareKeysPanel`) is updated in the same window. No external pins
break.

## [2.2.0] — 2026-05-14 · Inline sudo-mode redirect helper

Additive · two new exports for the consumer-side counterpart to the
ochk.io `/sudo` page:

- `redirectToSudo({ returnTo?, purpose?, config? })` · navigates the
  browser to `https://ochk.io/sudo?return_to=…&purpose=…`. The auth
  host runs an email-OTP or BIP-322 re-authentication ceremony,
  re-issues the session JWT with a fresh `sudo_at` claim, redirects
  back. Consumers retry the original sensitive action once they're
  back; the gate sees the fresh claim and lets it through.
- `handleSudoRequired(body, args)` · one-liner that checks
  `body.reason === 'sudo_required'` and redirects if so. Returns
  `true` when it redirected (caller should short-circuit), `false`
  otherwise.

No React state is involved — the flow is a single browser
navigation. A future inline-modal version (no redirect) will keep
the same function names so consumers don't have to change call-sites.

Peer dep raised to `@orangecheck/auth-core` `^2.2.0` (for
`verifySudoClaim` server-side and the `sudo_at` claim shape).

## [2.1.1] — 2026-05-14 · WebAuthn hook error-surface fix

Bug fix · `useWebAuthnRegister` and `useStepUpAuth` previously returned
`null` on failure with the reason buried in the hook's `error` state. The
caller couldn't read the reason post-await because of React closure
semantics (the destructured `status` / `error` were captured at render
time, not after the awaited state update). Symptom: clicking "register
key" did nothing visible when the underlying request failed (e.g. on
`session_too_old`).

Both hooks now return a discriminated union:

```ts
register(args) → Promise<{ ok: true; credential } | { ok: false; reason }>;
stepUp(args)   → Promise<{ ok: true; step_up_at } | { ok: false; reason }>;
```

Consumers branch on `result.ok` and read `result.reason` directly. The
hook's `error` / `status` fields stay for debug/UX, but the awaited
return value is now the source of truth for "did this ceremony
succeed."

Breaking only against the v2.1.0 register/stepUp signatures; types
adjusted in the same package, no semver-major needed because the API
is hours old and no published consumer pinned 2.1.0.

## [2.1.0] — 2026-05-14 · WebAuthn step-up hooks

Additive · all v2.0.0 consumers keep working unchanged. Three new
React hooks wrap the ochk.io `/api/auth/webauthn/*` surface plus the
`@simplewebauthn/browser` ceremony:

- `useWebAuthnRegister()` — bind a hardware key to the account.
- `useWebAuthnList()` — list / rename / revoke registered keys.
- `useStepUpAuth()` — assert against a registered key before a
  sensitive action; on success refreshes the session so
  `verifyStepUpClaim(payload, …)` (from auth-core v2.1.0) flips to
  true immediately.

`@simplewebauthn/browser` is now a hard runtime dependency. Bumps
the peer requirement for `@orangecheck/auth-core` to `^2.1.0` (the
new `step_up_at` claim + `verifyStepUpClaim` helper).

## [0.1.0] — Initial published state

Initial public release. `<OcSessionProvider>`, `useOcSession()`, `<OcSignInButton>`, `<OcAccountPill>` for cross-subdomain ochk.io auth.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-auth-client-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-auth-client-v0.1.0
