# Changelog

All notable changes to **`@orangecheck/auth-client`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [2.21.0] — 2026-06-23 · per-tab account inheritance for new/cross-subdomain tabs

### Added

- **`installTabLinkDecorator(authOrigin)`** — a capture-phase link decorator
  (auto-installed by `OcSessionProvider`) that stamps the tab's effective
  account `did:oc` onto outgoing family-origin links (`#oc-as=<did>`) when the
  tab is pinned. Fixes the bug where a CTRL/⌘/middle-click — or a same-tab
  cross-subdomain navigation — opened as the shared cookie's DEFAULT account
  instead of the account the originating tab was operating as. Conservative:
  no pin → no-op, family origins only (never leaks the did to third parties),
  reads the pin fresh per event, never clobbers an existing `#fragment` /
  `download` / non-http(s) link, mutates `href` in place (no popup-blocker
  surface).
- **`consumeTabAccountHint(authOrigin)`** — run on mount BEFORE the first
  `/api/auth/me` fetch; adopts `#oc-as=<did>` by minting a pin for that account
  via the host's `/api/auth/tab` (roster-revalidated) and strips the fragment.
  Fail-safe: a stale host / roster miss / network error leaves the tab unpinned
  (legacy cookie-following behavior). The `did:oc` is a public selector, never a
  credential — the JWT never enters the URL.
- **`TAB_ACCOUNT_HINT_KEY`** export (`'oc-as'`).

### Notes

- Requires the auth host's `POST /api/auth/tab` to accept an optional
  `{ did_oc }` body (roster-membership-gated mint, no `Set-Cookie`). Backward
  compatible against an older host (the hint is simply not adopted).
- `auth-core` is unchanged — `resolveSessionFromRequest` already resolves the
  tab header first and fails closed.

## [2.20.0] — 2026-06-23 · `providersFirst` on by default

### Changed

- **`OcSignIn` now defaults `providersFirst` to `true`.** The OAuth providers
  (Google / GitHub) render above the panel and the email one-time-code tab is
  the default active tab, with the BIP-322 wallet path one tab away — making the
  email/OAuth-first ceremony the **family standard** every consumer inherits
  without per-site props. `initialPath` consequently defaults to `'email'`.
- Pass `providersFirst={false}` to restore the legacy bitcoin-first ordering
  (`initialPath` then defaults to `'wallet'`). No other behavior changes.

## [2.19.0] — 2026-06-22 · `providersFirst` on OcSignIn

### Added

- **`OcSignIn` gains `providersFirst?: boolean`** (default `false`). When set,
  the third-party providers (Google / GitHub) render **above** the wallet +
  email panel and the email path becomes the default active tab — the
  familiar on-ramp leads, the BIP-322 wallet path stays one tab away,
  relabelled "bitcoin · self-custody". Built for ochk.io's public homepage,
  to meet first-time non-Bitcoiner visitors where they are. Honors family
  rule #3: email / OAuth is the easy bridge; the Bitcoin address remains the
  canonical identity it resolves to. Every other consumer is unaffected — the
  canonical bitcoin-first ceremony stays the default.
- `initialPath` is now optional; it defaults to `'email'` under
  `providersFirst`, otherwise `'wallet'` as before.

## [2.18.0] — 2026-06-11 · per-tab account pinning + family-wide add-account return

Per-tab account isolation — one browser signed into N roster accounts,
each tab actively operating as its own one:

- New `tab-session` module: a tab pins itself to an account by holding
  that account's session JWT in sessionStorage and sending it as the
  `x-oc-tab-session` header (a *credential*, never a bare selector —
  servers verify it exactly like the cookie token). Exports
  `readTabSession` / `writeTabSession` / `clearTabSession` /
  `tabSessionHeader` / `installTabFetchInterceptor` /
  `consumeTabAdoptMarker` + `TAB_SESSION_HEADER` /
  `TAB_SESSION_STORAGE_KEY` / `TAB_ADOPT_HASH`.
- `OcSessionProvider` pins each tab on first authenticated resolve (via
  the host's `POST /api/auth/tab`), attaches the pin to its own fetches
  AND — via a conservative same-site `window.fetch` interceptor — to
  app-level data calls, so the server acts as the account the tab
  displays. `switchAccount()` re-pins THIS tab from the fresh JWT the
  host echoes; other open tabs keep their pins and are no longer
  yanked on focus. `signOut({scope:'current'})` signs out the TAB's
  account. New `tabPinned` boolean on `OcSessionState`.
- Fail-closed reconciliation: a dead pin (401) retries once as the
  cookie account; a server that answers as a different account than
  the pin (pre-migration deploy) drops the pin rather than display an
  account the server isn't acting as.
- Degrades cleanly: hosts without `/api/auth/tab`, servers that ignore
  the header, and privacy modes without sessionStorage all fall back
  to the legacy shared-cookie behavior.

`<OcSignIn>` return-target fixes (the add-another-account redirect):

- `returnTo` now accepts an absolute `https://` URL on
  `ochk.io` / `*.ochk.io` (mirroring the auth host's own allowlist),
  and when omitted is auto-detected from `?return_to=` / `?next=` in
  the page URL — symmetric with the existing `?add=1` auto-detect.
- The OAuth provider buttons carry the resolved target **verbatim**
  through the provider hop (previously they clamped to the embedding
  page's own origin, stranding a vault.ochk.io user on the ochk.io
  homepage after adding an account via Google/GitHub), and forward
  `add=1` so the host can run roster-adopt semantics on the callback.
- A ceremony completed in-tab clears any stale tab pin, so the tab
  adopts the just-authenticated account.

## [2.16.0] — 2026-05-19 · OcSignIn provider buttons get brand glyphs

- `<OcSignIn>` provider buttons now render the vendor brand glyph
  (the Google **G**, the GitHub Octocat) alongside the label —
  matching the conventional "Continue with X" pattern users expect
  from any modern sign-in screen.
- The glyphs are drawn in `currentColor`, so they pick up the OC
  muted-foreground theme tone rather than each vendor's brand
  palette — visually individuated, family-styled.
- Forward-compatible: an unknown provider id renders the button
  text-only — no icon registration is required to add a provider
  host-side.

## [2.15.0] — 2026-05-19 · OcSignIn renders the live provider list

- `<OcSignIn>`'s provider section now **fetches the auth host's
  `/api/auth/providers`** instead of a hardcoded list — a button
  appears only for a provider whose credentials are configured
  host-side. With none configured the section renders nothing.
- Consequence: enabling GitHub / Apple sign-in (now supported by the
  auth host) is a host-side env change — **no redeploy of consumer
  sites**. The `OAUTH_PROVIDERS` constant is gone.

## [2.14.1] — 2026-05-18 · provider sign-in returns to the right site

Fix: on a family subdomain, "Continue with Google" sent a **relative**
`return_to` to the auth host. The provider flow's final redirect is
issued by the auth host (`ochk.io`), so a relative target resolved
against `ochk.io` — a `vault.ochk.io` user landed on `ochk.io/vault`.
`<OcSignIn>` now resolves `window.location.origin` and sends an
absolute return target, so the user comes back to the site they
started on.

## [2.14.0] — 2026-05-18 · Continue with Google in OcSignIn

- `<OcSignIn>` gains a third sign-in path: a **"Continue with Google"**
  button in a new providers section below the BIP-322 and email-OTP
  options, deliberately less prominent. It is a plain navigation to the
  auth host's `/api/auth/google/start` — the auth host runs the OAuth
  dance and mints the family `.ochk.io` session. The section is built
  from an `OAUTH_PROVIDERS` list so GitHub / Apple / etc. slot in as
  they are enabled host-side.
- `<OcSignIn>` shows a small error banner when it is loaded with
  `?oauth_error` in the URL (the auth host redirects there when a
  provider sign-in fails).

Additive — no API change. Requires the auth host to expose
`/api/auth/google/start`; until then the button leads to a graceful
"not configured" redirect.

## [2.13.0] — 2026-05-18 · displayIdentity + setDisplayIdentity()

Surfaces the badge identity a user has promoted (see `@orangecheck/auth-core`
2.4.0's `display_identity` claim) and the means to change it.

- `OcAccount.displayIdentity: DisplayIdentity` — **always populated**;
  `{ kind:'did', value:didOc }` when the user has never promoted or the
  session predates the feature. `<OcAccountMenu>` renders it as the
  collapsed badge label; integrators rendering their own chip read it
  directly.
- `useOcSession().setDisplayIdentity(kind)` — PATCHes the auth host,
  which re-mints the `.ochk.io` cookie with the new claim, then
  `refresh()`es. Rejects when the kind is not a verified identity.
- `fetchOcLinkedIdentities()` — the linked-identity list as a plain
  function (the data `<OcLinkedIdentities>` renders), for surfaces that
  need it without the management UI — notably the account menu's
  promote list.
- New exports: `DisplayIdentity`, `DisplayIdentityKind`,
  `DISPLAY_IDENTITY_KINDS`.

Additive. `displayIdentity` is newly required on `OcAccount`, but it is
populated by the package's own normalizer — no consumer code change is
needed unless you construct `OcAccount` values by hand.

## [2.12.0] — 2026-05-18 · sign-out survives an immediate navigation

`OcSessionProvider`'s `signOut()` now sends the logout request to the auth
host with `keepalive: true`. Previously the round-trip was a plain `fetch`:
if the caller hard-navigated away in the same tick (which `<OcAccountMenu>`
in `@orangecheck/ui` ≥0.11.0 now does on sign-out — it forwards the user
home immediately to foreclose an auth-gate redirect race), the in-flight
logout was cancelled on unload and the `.ochk.io` cookie could be left
uncleared. `keepalive` lets the request finish past page unload, so the
session is reliably torn down regardless of how fast the caller leaves.

No API change — purely a reliability fix for the navigate-on-sign-out path.

## [2.11.0] — 2026-05-18 · linkPrompt: explicit skip with guidance

The post-sign-in link step (`LinkPromptStep`, shown when the form checkbox
is ticked) now carries an explicit **"skip — I'll do this later"** control
and a line telling the user they can link the identity anytime from
`me.ochk.io/me/identity`. The ceremony was always cancellable, but the exit
is now obvious and reassuring — a user who changes their mind on the link
step has a clear, guided way out, not a bare "cancel".

## [2.10.0] — 2026-05-18 · link-at-sign-in is an opt-in checkbox

Replaces 2.9.x's automatic post-sign-in prompt with an explicit, optional
**checkbox on the sign-in form** — which is what was actually asked for.

`<OcSignIn>` now shows, below the sign-in panel on both the wallet and email
paths, an unchecked checkbox: "After signing in, also link a Bitcoin wallet /
an email — optional." If the user ticks it, the complementary identity's link
ceremony (BIP-322 for a wallet, OTP for an email) runs inline immediately
after a successful sign-in, before the redirect. Left unchecked — the
default — sign-in is ordinary. No auto-popup; nothing is shown to a user who
did not opt in.

`linkPrompt` (default `true`) now controls whether the checkbox is rendered;
`linkPrompt={false}` omits it. The `LINK_PROMPT_DISMISS_KEY` export and the
2.9.1 localStorage decline-memory are removed — unchecked is the default, so
there is nothing to remember.

## [2.9.1] — 2026-05-18 · linkPrompt is an optional offer, not a gate

Refines 2.9.0's link-at-sign-in so it is clearly *optional*:

- **A decline is remembered.** "Not now" writes `LINK_PROMPT_DISMISS_KEY`
  to `localStorage`; `OcSignIn` reads it and does not re-show the offer on
  subsequent sign-ins (and skips the `/api/auth/me` round-trip entirely).
  The offer no longer recurs every sign-in — it is shown, declined once,
  and respected.
- **Reframed as an offer.** The step leads with "you're signed in", the
  copy says it is optional and can be done later, and the decline action
  reads "not now" rather than "skip".

Linking remains one click into the BIP-322 / OTP ceremony for users who
want it. `linkPrompt={false}` still disables the step entirely.

## [2.9.0] — 2026-05-18 · Fluid link-at-sign-in

`OcSignIn`'s `linkPrompt` is redesigned into the flow the sign-in ceremony
always should have had — and it is now **on by default**.

Immediately after a successful sign-in, `OcSignIn` checks (one `/api/auth/me`
call) whether the account is missing its **complementary** identity. If so it
shows a focused step: a user who signed in with email is offered their
**Bitcoin wallet**; a wallet user is offered their **email**. "Link now" drops
straight into the BIP-322 / OTP ceremony *inline* — no navigation — because the
sign-in just proved one credential and this is the moment to prove the second.
The user can skip.

Key fixes over the 2.6.0 `linkPrompt`:

- It is **focused** — it offers exactly the one missing identity and goes
  straight into that ceremony, instead of rendering the whole
  `<OcLinkedIdentities>` management panel.
- It runs as an **interstitial before** `onSuccess` / `resolveReturnTo` /
  `returnTo`, so it composes with custom post-sign-in routing. The 2.6.0
  version was silently ignored whenever `onSuccess` was set — which is every
  real consumer — so it never fired anywhere.
- If the complementary identity is already linked, the step is skipped
  silently. Pass `linkPrompt={false}` to opt out.

## [2.8.0] — 2026-05-18 · Remove `OcIdentityBond` (reverted)

Removes `<OcIdentityBond>` and its exports — the two-key BTC+Nostr
"Binding Attestation" publish ceremony added in 2.7.0 (two days old, no
external importers). It was built on a mis-designed premise: a
mutually-signed artifact requiring a NIP-07 Nostr counter-signature.
oc-attest is a single-signature protocol — one BIP-322 signature links a
Bitcoin address to self-asserted handles; Nostr is transport, not a
trust root. The `@orangecheck/sdk` / `@orangecheck/nostr-core` optional
peers added for it are dropped.

`<OcLinkedIdentities>` now shows a thin **portable-attestation pointer**
instead: once the account has a linked Bitcoin address, it routes the
user to `attest.ochk.io/create` — the existing OC Attest builder, which
already pre-fills the address from the signed-in session. Publishing a
standard, single-BIP-322-signature attestation is the correct,
protocol-native way to put identity links on Nostr.

`<OcLinkedIdentities>`'s list / link / unlink / transfer surface and
`OcSignIn` are unchanged.

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
