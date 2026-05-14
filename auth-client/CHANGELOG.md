# Changelog

All notable changes to **`@orangecheck/auth-client`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

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
