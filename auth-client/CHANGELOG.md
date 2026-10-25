# Changelog

All notable changes to **`@orangecheck/auth-client`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [2.40.0] — 2026-10-25

### Added

- `otpNetworkCapText(retryAt, instead?)`: the sentence for ochk.io's
  `otp_network_cap` answer (429, `retry_at`, Retry-After). A network that has
  had its hour of sign-in codes waits until the hour rolls, so OcSignIn now says
  that and when, in the reader's own time, instead of "wait a minute". Other
  sites that send codes can say the same thing with it.
- `newAccountsCapText(retryAt)`: the sentence for ochk.io's
  `new_accounts_capped` answer (429 with `retry_at`, or `?oauth_error=` and
  `retry_at` on the redirect back from Google or GitHub). Every way of signing
  in counts toward that cap, so OcSignIn says when a new account can be made
  and that an existing one still signs in. It says the same on the wallet,
  email and provider paths.
- OcSignIn says when a capped wallet challenge frees: `challenges_capped`
  ("from your connection") and `network_challenges_capped` ("from this
  network"), each with its time.

## [2.39.0] — 2026-10-25

### Changed

- The did in an `#oc-as=` tab hint, and the email typed into sign-in and into
  linking, now go through `isDidOc` and `normalizeEmail` from
  `@orangecheck/auth-core/identifiers` instead of local copies. Same behaviour.
  The peer and dev dependency on `@orangecheck/auth-core` is `^2.22.0`.

## [2.38.0] — 2026-10-24

### Changed

- `familyReturnTarget` accepts an absolute URL only on a listed family site
  (`isFamilyOrigin` from `@orangecheck/auth-core/family-origins`), not on any
  name under `.ochk.io`: `https://btcpay.ochk.io/...` and
  `https://relay.ochk.io/` now answer `undefined`, and so does a family host on
  another port.
- The tab link decorator stamps `#oc-as=<did>` only on this origin, the auth
  host and listed family sites, never on another name under `.ochk.io` or over
  plain http.
- The peer on `@orangecheck/auth-core` is `^2.21.0`.

## [2.37.2] — 2026-10-24

### Docs

- README: `OcSignInButton` is for orangecheck's own sites. A site of its own
  is pointed to `@orangecheck/me-client`'s sign-in button and
  ochk.io/docs/integration/sign-in-button.

## [2.37.1] — 2026-10-24

### Fixed

- **`signInUrl` returns to the page on a server-rendered page.** The provider
  built it from `window.location` as it rendered, so the browser's first
  render named the page while the server's HTML did not, and React keeps the
  server's `href` on a link it hydrates: `OcSignInButton`, `OcAccountChip` or
  any `<a href={signInUrl}>` on such a page sent people to a sign-in that
  returned them home. The page is now read through `useSyncExternalStore`: the
  bare sign-in on the server and in the first render, the page after it, and
  the new page after a route change or Back. `defaultReturnTo` still wins.
- `provider-ssr.test.tsx` renders on the server, hydrates that HTML in jsdom
  and reads the link, then moves the page. It fails on 2.37.0.

## [2.37.0] — 2026-10-22

### Changed

- **A refused Google or GitHub sign-in says what to do next.** The auth host
  now finds a provider sign-in's account by the provider's own id for the
  person, and reaches an existing email account only where the provider hosts
  the address. When it refuses, `OcSignIn` names the reason instead of "That
  sign-in didn't finish": `oauth_error=email_code_required` says the email
  already has an account and to sign in with an email code, and
  `account_mismatch` says a different Google or GitHub account is already
  linked to it. Either opens the form on the email code. Other reasons keep
  the general line.

## [2.36.1] — 2026-10-22

### Fixed

- **An address scanned in capitals signs in.** QR codes carry bech32 in
  capitals, and only the lowercase spelling verifies. The address fields of
  `OcSignIn`, the link flow and the bond flow now hold the canonical spelling
  (`normalizeAddress` from `@orangecheck/bip322` ^1.1.2) as soon as the text is
  a whole address, so the challenge names the address the account is keyed by.
- `looksLikeBitcoinAddress` refuses mixed-case bech32, which BIP-173 forbids.

## [2.36.0] — 2026-10-21

### Changed

- **A wallet that does not sign is named in the family's words.** Sign-in
  showed the wallet's own text: "User rejected the request", "That didn't
  work" for a bare `{ code: 4001 }`, or the adapter's lowercase "wallet
  signed with bc1…, switch to bc1… and sign again". The wallet step now has
  its own catch and shows `walletFailureText` from
  `@orangecheck/wallet-adapter`, one sentence for a decline, a wrong account,
  a missing wallet and no answer, the same as every family site.
- Requires `@orangecheck/wallet-adapter` ^0.7.0.

## [2.35.2] — 2026-10-21

### Changed

- **The fields wear app-design's field focus.** Every text field of the
  ceremony carries `data-oca-field`: the email, the code, the address, the
  message to sign and the signature. So do the link step's fields and the
  bond address field. On a page with `@orangecheck/app-design` 1.13.0 or
  later, focus draws the same 2px `--ring` edge and soft halo as the family's
  own inputs (3.41:1 light, 6.75:1 dark on ochk.io and ochk.app), in place of
  the outline. Elsewhere the attribute does nothing and the browser's ring
  shows, as in 2.35.0.

## [2.35.1] — 2026-10-21

### Fixed

- **A session check that never answers no longer leaves the page loading.**
  `refresh()` fetched `/api/auth/me` with no time limit, so a request that
  hung kept `status` at `'loading'` for good: ochk.app's account pages spun
  past 50 seconds, and OC Agent's inspect page showed an empty report. Each
  `/me` request now gives up after 10 seconds (`AbortSignal.timeout`, or a
  timer where a browser lacks it). `status` becomes `'error'` with a message
  that says so, which every site already handles. It does not retry.

## [2.35.0] — 2026-10-21

### Changed

- **The two sign-in methods are one tablist for the keyboard.** Email and
  Bitcoin wallet were both Tab stops and arrows did nothing. Now only the
  selected tab is in the Tab order. The arrows, Home and End move between the
  two and select as they go, with focus following. Each tab names its panel,
  and the panel is named by its tab. A click works as before, and both
  methods are always offered. The tablist is labelled "Sign-in method".
- **Every field shows the page's focus ring.** The inputs and textareas of
  the ceremony and the link forms set `outline: none` inline, so focusing one
  changed nothing on screen. They no longer do. On an `@orangecheck/app-design`
  page the family ring draws (2px in `--ring`, 3:1 or more in both themes),
  and elsewhere the browser's own ring.
- **An unreachable auth host is named.** A failed request read "We couldn't
  reach the server." It now reads "We couldn't reach the orangecheck sign-in
  service at <host>. Check your connection, then try again." `<host>` comes
  from `authOrigin`, so a staging host names itself.

## [2.34.0] — 2026-10-20

### Changed

- **A page loads only the parts it uses.** The ES module build was one file,
  so a site's bundler kept every export any page used and put all of it in
  `_app`, because `_app` imports the provider: the sign-in ceremony, the link
  forms and the passkey code reached every page of every site, about 35 kB
  of script before compression. The ES module build is now one file per
  source file, and the package declares `"sideEffects": false`. On OC Stamp
  that takes 10 kB (gzip) off every page's first load. The exports, the
  CommonJS build and the types are unchanged. A test fails if the provider's
  files reach the sign-in or `@simplewebauthn/browser`.

## [2.33.4] — 2026-10-20

### Changed

- **The ceremony's text takes a site's sizes by role.** On ochk.app `/signin`
  the lead under a tab, the field labels, the tabs and the submit label
  rendered at 13 to 13.75px against the app's 15px body and buttons:
  `--oc-signin-scale` multiplies 10 to 11px family sizes, and the lead (13px)
  and the hints (10.5px) were fixed and took no setting at all. Four
  variables now size the roles, each falling back to the element's family
  size, so a site that sets none (analytics, bot, forge) renders exactly as
  before:
  - `--oc-signin-text-size`: the lead under a tab, notices, the link-also row
  - `--oc-signin-hint-size`: hints, errors, the "or" between blocks
  - `--oc-signin-label-size`: field labels and the method tabs
  - `--oc-signin-button-size`: the submit button and the text buttons beside it

  `@orangecheck/app-design` sets them to its body, hint, label and button
  sizes. A test fails if signin.tsx gains a fixed text size other than a
  field's 16px.

## [2.33.3] — 2026-10-20

### Fixed

- **The restored fragment stays restored on a Next pages-router page.** Next
  captures the address before the app runs, and on a page with a query or a
  dynamic route it replaces the address with that capture once it has
  hydrated. That took 2.33.2's restored fragment off again (seen live on
  ochk.app `/pricing?x=1`, where it came back as `#oc-adopt`). A page that
  read the fragment on mount still had it; the address bar and a reload did
  not. OcSessionProvider now holds the restored fragment for ten seconds and
  puts it back once if the address is reset to the same path with no
  fragment or only `#oc-adopt`. A fragment the page sets itself, or a move
  to another page, ends the hold.

## [2.33.2] — 2026-10-20

### Fixed

- **A return address never puts the page's fragment in a URL.**
  `redirectToSudo()` defaulted `return_to` to `window.location.href`, and
  `buildSignInUrl`, `buildAddAccountUrl`, the session's `signInUrl` and
  `addAccountUrl()` passed a given address through whole, so a fragment (a
  share link's envelope, a team invite's key) rode in `/sudo?return_to=` or
  `/signin?return_to=`, where the auth host's logs and analytics see it.
  Every one of them now leaves the fragment off, as do OcSignIn's provider
  start links.
- The fragment is not lost. It is kept in this tab's sessionStorage under
  the path it belongs to at the moment of leaving: when `redirectToSudo()`
  or `returnToHere()` is called, or when a link that names this page as its
  `return_to` is followed (OcSessionProvider listens). Rendering a link keeps
  nothing. On return, OcSessionProvider puts the fragment back with
  `history.replaceState` before the page renders, in place of the auth
  host's `#oc-adopt` marker (whose adoption still runs), then deletes it. It
  is used once, never overwrites a fragment the address brought, and lapses
  after 15 minutes. A return to another origin loses it rather than carry it.

### Added

- `returnToHere()`: this page as a return address, path and query only, for
  a site that builds `/signin?return_to=` itself. Also exported:
  `withoutFragment`, `stripFragment`, `keepFragmentOnReturnLinks`,
  `restoreReturnFragment`, `FRAGMENT_TTL_MS`.

## [2.33.1] — 2026-10-20

### Fixed

- `useOcAddressSuggestion` and `OcAddressInput` offer a signed-in account's
  address on consumer sites. They read only `primaryBtc`, which a site that
  verifies the session locally answers as null, so the suggestion never
  appeared outside the auth host. They now fall back to the display identity
  when it is a Bitcoin address, as it is after a wallet sign-in. An account
  that shows an email and has no primary address is still offered nothing.

## [2.33.0] — 2026-10-20

### Changed

- Takes `@orangecheck/wallet-adapter` ^0.6.0, whose wallet list reads the design
  system's `--oc-wallet-*` variables. On the family design (app-design ≥ 1.1) the
  wallet step in `OcSignIn` now matches the page; on the classic design it looks as
  before, except that the pasted-signature field is 16px on phones so iOS no longer
  zooms.

## [2.32.3] — 2026-10-19

### Changed

- Hints no longer open with a terminal `> ` prompt (the sign-in wallet hint,
  the linked-identities loading and skip notes, and the backing notes). The
  backing explainer is in sentence case. ochk.app and the SDK sign-in popup
  render these in a product voice, where the prompt read as a stray character.

## [2.32.2] — 2026-10-19

### Changed

- After sign-in, the "skip" note said you could link the other way in later at
  "me.ochk.io/me/identity", as plain text. It now links to
  ochk.app/me/account, at the section that lists the ways to sign in
  (`#ways`), in a new tab. ochk.app replaces me.ochk.io's pages.

## [2.32.1] — 2026-10-17

### Changed

- The email step says "Add a Bitcoin address any time", the verb the account
  page uses for every way to sign in.

## [2.32.0] — 2026-10-17

### Changed — sign-in doesn't sound Bitcoin-only

- `OcSignInButton` says "sign in" by default, not "sign in with bitcoin":
  most people sign in with email, Google or GitHub. Pass `label` to keep the
  old text.
- The email step ends "Link a Bitcoin address any time: a way in that only you
  hold." A linked address is another way in, not a second identity.

## [2.31.0] — 2026-10-16

### Changed — `OcBond` reads as what it is: backing, with a coin that stays in the wallet

- Copy says "back your account", "backed by bitcoin" and "not backed". It no
  longer claims the coin never moves: it stays in the person's wallet, and
  spending it ends the backing.
- "stop backing" asks first, inline, and "keep" is focused.
- Coins under 1,000 sats are left out of the picker and counted in one line
  below it. If every coin is that small, the form says so instead of offering
  an empty choice. The first coin that can back the account is picked.
- The address step is a real form with a visible label, so Enter submits.
  Nothing is prefilled. The coin step and the signing step each have "back".
- Small print is 12px or more and never dimmed. Radios take the primary
  color.

### Fixed

- A tab pinned to one account re-pins with the token the auth host mints
  after a change, so its session carries the new backing at once. The host
  no longer touches the browser's shared cookie from such a tab.

### Added

- Refusals for every reason `/api/auth/bond` gives, including
  `coin_too_small`, `coin_backed_another_recently`, `bond_window_too_long`
  and `rate_limited`.

## [2.30.1] — 2026-10-16

### Fixed — a lockfile refresh could still break wallet sign-in

- `@orangecheck/wallet-adapter` is now `^0.5.2`, the first version that
  verifies signatures with `@orangecheck/bip322`. The old range let a site keep
  0.5.1, which verifies through bip322-js, while its lockfile picked up
  bitcoinjs-lib 6.1.9; every wallet signature then read as the wrong
  account's. That is how wallet sign-in broke on ochk.app and five *.ochk.io
  sites on 2026-10-16.

## [2.30.0] — 2026-10-16

### Added — `OcBond`: back the account with bitcoin, on any family site

- `<OcBond authOrigin onChange />` lets the signed-in account pledge one coin
  it holds (oc-attest-protocol `BOND.md`): address, coin, wallet signature,
  against the auth host's `/api/auth/bond` with the family cookie, the same way
  `OcLinkedIdentities` works. The coin never moves; apps see floors and a
  number unique to each of them. Optional: every account signs in without it.
- `fetchOcBond()` and `bondFloorsText()` for sites that show the bond
  elsewhere.

## [2.29.0] — 2026-10-15

### Changed

- **Sign-in copy is written in sentence case** ("Email", "Bitcoin wallet",
  "Send one-time code"). It was lowercase in source and leaned on the family's
  uppercase transform, so a site that sets `--oc-signin-case: none` showed
  lowercase labels. Family sites render exactly as before.

### Added

- **`--oc-signin-arrow`** sets the display of the `→` after a submit label
  (default `inline`). The arrow is never part of the button's name.

## [2.28.0] — 2026-10-15

### Added

- **`OcSignIn mode="first-party"`** for orangecheck's own site on another
  domain (ochk.app). The ceremony runs in place there instead of in a popup.
  No call to the auth host carries credentials, so the `.ochk.io` cookie is
  neither sent nor set; the host returns a token bound to `audience`, which
  `onSuccess` (required in this mode) hands to the site to keep as its own
  cookie. No add-account or link prompts. Provider buttons appear only when
  `providerHref` names the site's own start route.
- **`OcAuthConfig.multiAccount`** (default `true`). A site with one session
  cookie of its own sets `false`: the provider pins no tab, stamps no links,
  and fetches no roster from the host.

## [2.27.0] — 2026-10-15

### Added

- **The sign-in ceremony takes a site's own type.** `OcSignIn` and the
  link-another-identity step read their font, letter case, tracking, label
  scale, radii and button weight from `--oc-signin-*` CSS variables, each
  falling back to the value it had before, so family sites render exactly as
  they did. ochk.app sets them to draw the same ceremony in its own design
  instead of forking it. A test keeps new literals out.

## [2.26.0] — 2026-10-08

### Fixed

- **Sign-in errors are sentences, not reason codes.** `OcSignIn` printed the
  host's reasons verbatim: an address typo showed `bad_request`, a bad code
  `wrong_code`, an expired one `expired`. `humanSigninError()` maps each to
  what happened and what to do next, per path.
- **A typo no longer blames a missing wallet.** The address is shape-checked
  before a challenge is fetched (`looksLikeBitcoinAddress()`).
- **The wallet tab works with no browser wallet.** On a phone, or with Sparrow
  or a hardware wallet, it used to end at "no BIP-322 wallet extension
  detected · install one and refresh". It now shows the message to sign and
  takes the signature back. That path names no signature scheme, so a legacy
  BIP-137 signature (Electrum, most hardware wallets on a `1…` address) still
  verifies. With more than one browser wallet installed you can pick which one
  signs, where it used to take the first; submitting before detection finishes
  waits for it instead of falling through to the paste path.
- A malformed pasted signature says so, instead of "doesn't look like a
  Bitcoin address" (the host answers `bad_request` for both). A failed fetch
  or an HTML error page reads "couldn't reach the server", not "Failed to
  fetch" or a JSON parse error.
- Every sign-in field has a programmatic label, the signature field takes
  focus when the paste step opens, "copy message" confirms or says it could
  not copy, and the hints and the link-also row are full-contrast with a 44px
  hit area.
- **Code step can send a new code**, instead of only "use a different email".
- **Provider buttons hold their space while loading.** `providersFirst`
  rendered nothing until `/api/auth/providers` answered, then pushed the form
  down 130px (CLS 0.11 at 390px on ochk.io/signin?add=1).
- Tabs read "email" / "bitcoin wallet" and are 44px tall; the long labels
  wrapped onto two lines in a 318px column. Jargon hints ("Codes come from the
  auth host", "oc_session is set on Domain=.ochk.io") are gone.
- `OcLinkedIdentities` no longer says linked identities "never appear in
  dashboard chrome", which the ochk.io dashboard header contradicts.

### Added

- `OcLinkedIdentities` `attestationLink` prop (default `true`). ochk.io's
  dashboard hosts its own attestation builder one panel below, so it offered
  the same action twice.

## [2.25.3] — 2026-09-25

### Changed

- `@orangecheck/wallet-adapter` range widened to `^0.4.2 || ^0.5.0`. A site
  on wallet-adapter 0.5.0 no longer bundles a second 0.4.x copy through
  auth-client. auth-client uses only `detectWallets`, `getSigner` and
  `OcWalletButton`, which are unchanged in 0.5.0.

## [2.25.1] — 2026-09-16

### Fixed

- **`@orangecheck/wallet-adapter` was declared optional but could not be
  omitted.** The sign-in and link-identity components load it with
  `import('@orangecheck/wallet-adapter')`, and a bundler resolves that specifier
  at build time, so a site without it failed to build — `Module not found`
  from `dist/index.mjs`, even for a site that only mounts `OcSessionProvider`.
  It is now a dependency; the chunk is still loaded on demand. The "not
  installed" error messages could no longer fire and now say the chunk failed
  to load. A test checks every package the source imports against the
  manifest.

## [2.25.0] — 2026-09-14

### Added

- `isSudoAccountMismatch()` and `SUDO_ACCOUNT_MISMATCH_MESSAGE`. The host
  distinguishes two sudo failures — `sudo_required`, which the ceremony fixes,
  and `sudo_account_mismatch`, which it cannot, because the ceremony runs on
  ochk.io for the cookie's default account and can't reach a tab pinned to a
  different one. `handleSudoRequired()` only ever knew the first, so a caller
  holding just that helper had no way to tell them apart and would bounce the
  user to `/sudo` forever.

### Fixed

- **The identity-linking forms ignored a sudo challenge entirely.** Linking a
  Bitcoin address or an email mutates the account's auth graph — the same
  surface a stolen cookie attacks, and the reason registering a second hardware
  key already asks for a fresh proof. Both link forms now route
  `sudo_required` to the ceremony and stop on `sudo_account_mismatch` with a
  message that says which account to switch to.

  This ships BEFORE the host begins enforcing that gate. A client that cannot
  act on the challenge would surface it as a bare `sudo_required` string with
  no way forward, so the order matters.

## [2.24.0] — 2026-09-03

### Fixed

- **The email sign-in copy said something untrue, on every `/signin` page in
  the family.** It read: _"The federation provisions a custodial wallet for you
  in your browser."_ Two problems.

  Nothing is provisioned at sign-in. `oc-www`'s `email-otp/verify` route
  creates an account row, a `did:oc` and a session cookie — a Fedimint wallet
  is provisioned client-side on first visit to `me.ochk.io`. This module's own
  docstring had the qualifier ("on first /me visit"); the form copy dropped it.

  And "a custodial wallet" names no custodian. The sats are held by the
  **federation's guardians**, never by OrangeCheck, which coordinates Lightning
  operations and does not custody — the verify route says exactly that. An
  unsubject'd "custodial" reads as OC holding it, which contradicts
  `oc-docs/charter.mdx` ("does not operate a custodial wallet") and
  `@orangecheck/legal` ("no custodial wallet of any kind"). Naming the trust
  anchor is family invariant 8.

  Now: _"We email you a 6-digit code. No password, and no wallet needed to
  start. Link a Bitcoin address any time — that is the identity you hold
  yourself."_ True at the moment it is shown, and the custody disclosure moves
  to where the wallet is actually created, which is also where it matters.

### Changed

- The email-form hint drops `Rate-limited 5 starts/hour/IP` — operator detail
  on a consumer sign-up, and a user who hits the limit gets an error that says
  so. It keeps the trust anchor and the two facts a user needs: _"Codes come
  from the auth host, expire in 10 minutes, and work once."_

  Together these take the email path from ~48 words of prose around one input
  to ~22.

## [Unreleased]

### Deprecated

- `OcAccount.homeFederation`. The auth host no longer sets it, so it is always
  null. Where a person's sats sit is me.ochk.io's to say, per federation
  (`/api/me/balance`).

### Changed

- `OcAccount.signingMethod` is documented as what it now is: derived by the auth
  host from the account's verified linked identities, and only about who holds
  the signing key. No one can set it.

## [2.23.0] — 2026-09-03

### Security

- **Post-authentication open redirect in the return-target validation.** Both
  `safeReturnTo` and `familyReturnTarget` accepted a candidate on
  `startsWith('/') && !startsWith('//')`. The WHATWG URL parser treats a
  backslash as a slash in special schemes, and strips tabs and newlines, so
  every one of these passed as a "same-origin path" and resolved off-origin:

  ```
  new URL('/\evil.example',   'https://attest.ochk.io').href  -> https://evil.example/
  new URL('/\/evil.example',  'https://attest.ochk.io').href  -> https://evil.example/
  new URL('/\t/evil.example', 'https://attest.ochk.io').href  -> https://evil.example/
  ```

  `OcSignIn` passes the result to `window.location.assign`, so a victim
  completed a genuine sign-in on a genuine `ochk.io` domain and was then sent
  to an attacker-controlled page — the standard phishing primitive. The
  `oc_session` cookie is scoped to `.ochk.io` and is not sent to the attacker,
  so this leaked no token; the value is in the credibility of the redirect.

  Fixed by resolving instead of prefix-matching: a candidate is same-origin
  only if `new URL(candidate, origin).origin === origin`. Whatever the URL
  parser makes of the input is exactly what the browser will navigate to, so
  that is the thing compared — rather than blacklisting characters and hoping
  the list is complete.

### Added

- `safeReturnTo` and `familyReturnTarget` are now exported. Every consumer site
  hand-copied its own `isFamilyUrl` into `pages/signin.tsx` — fifteen
  near-identical copies, already drifted in two — and fourteen shared the
  prefix-check flaw above. Import these instead of writing a sixteenth.

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
  `x-oc-tab-session` header (a _credential_, never a bare selector —
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

Refines 2.9.0's link-at-sign-in so it is clearly _optional_:

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
straight into the BIP-322 / OTP ceremony _inline_ — no navigation — because the
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
