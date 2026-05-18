# Changelog

All notable changes to **`@orangecheck/ui`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). This package is family-internal
(consumed only by the `*.ochk.io` sub-sites); the surface is intentionally
small and the API may evolve quickly.

## [Unreleased]

- _(no pending changes)_

## [0.13.0] — 2026-05-18 · obscure identity labels + per-row copy

- `<OcAccountMenu>` — every identity value is now **partially obscured**
  wherever it is rendered as a label: first 6 characters · ellipsis ·
  last 4 (uniformly, every kind and every length). The collapsed badge
  and every "§ show as" row mask the value at rest; the full value is
  never shown as a label.
- Each **"§ show as"** row now carries a copy-to-clipboard button, the
  same affordance as the did row — it writes the *full* value via the
  async Clipboard API with a hidden-`<textarea>` fallback, so it works
  on touch devices and non-secure contexts. Copy and promote are
  separate controls on the row: tapping the row promotes, tapping the
  copy icon extracts.

## [0.12.0] — 2026-05-18 · account badge: promote which identity shows

- `<OcAccountMenu>` / `<OcAccountMenuView>` — the collapsed badge now
  shows the user's **promoted identity** (`account.displayIdentity`)
  instead of always the `did:oc`: their Bitcoin address, email, npub,
  or did, whichever they signed in with or later promoted. A vanity
  `displayName` still wins when set.
- New **"§ show as"** section in the popover, beneath the did — lists
  every identity the user holds and lets them promote one as the badge
  label across every `.ochk.io` site. Bitcoin / email rows lazy-fetch
  via `fetchOcLinkedIdentities()` on first open; promotion calls
  `setDisplayIdentity()` (re-mints the cross-subdomain cookie). The
  section is shown only when there are ≥2 identities to choose between.
- **Breaking (`OcAccountMenuSession`):** the session shape now requires
  `account.displayIdentity`, optional `account.nostrNpub`, and a
  `setDisplayIdentity(kind)` method. The connected `<OcAccountMenu>`
  wires these from `useOcSession()` automatically; sites passing a
  hand-built session to `<OcAccountMenuView>` (e.g. oc-www's `useAuth`
  adapter) must supply them. Requires `@orangecheck/auth-client` ≥2.13.0.

## [0.11.0] — 2026-05-18 · sign-out lands you home, never on a sign-in page

- `<OcAccountMenu>` / `<OcAccountMenuView>` — the **sign-out** menu item now
  hard-navigates to the site's own home immediately after firing `signOut()`,
  instead of just clearing session state and leaving the user where they are.

  **Why.** On an auth-gated page (e.g. a dashboard), clearing the session
  flips `status` to `anonymous`, and that page's own auth-gate `useEffect`
  would observe the flip and redirect to a sign-in page — so signing out
  bounced the user *to sign in again*, sometimes on the auth host
  (`ochk.io/signin`) rather than the current site. Signing out should mean
  "leave", not "go sign in again".

  The menu now navigates in the **same tick** as `signOut()`, before React
  commits the `anonymous` flip, so no auth-gate can win the race. The
  destination is the new **`signOutRedirect`** prop, default `'/'` — the
  current site's home. Pair with `@orangecheck/auth-client` ≥2.12.0, whose
  `signOut()` uses a `keepalive` logout fetch so the round-trip still
  completes through the page unload (peer requirement bumped accordingly).

## [0.10.1] — Account-menu width fit

- `<OcAccountMenu>` / `<OcAccountMenuView>` — widened the popover from
  `18rem` to `20rem` so a full `did:oc:<32-hex>` identity (39 chars) fits
  on one line of the mono header row instead of spilling ~3 characters
  onto a second line. Still capped at `calc(100vw-1rem)` for phones, and
  `break-all` remains as the graceful fallback.

## [0.10.0] — Copyable identity

- `<OcAccountMenu>` / `<OcAccountMenuView>` — the `did_oc` row in the
  popover header is now a one-click copy-to-clipboard affordance. Clicking
  anywhere on the address copies the full `did_oc` and flips the trailing
  glyph from a copy icon to a check for ~1.6s; the popover stays open so
  the confirmation is visible. Falls back to a hidden-`<textarea>` copy in
  non-secure contexts, and announces the result via an `aria-live` region.
  No API change — every consuming site picks this up by bumping the dep.

## [0.1.0] — Initial published state

Initial public release. Family-internal UI for the `.ochk.io` sub-sites:

- `<EcosystemSwitcher>` — cross-product dropdown for jumping between every
  site in the OrangeCheck family. Lifted out of seven near-identical copies
  living in each web repo.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/ui-v0.10.1...HEAD
[0.10.1]: https://github.com/orangecheck/oc-packages/releases/tag/ui-v0.10.1
[0.10.0]: https://github.com/orangecheck/oc-packages/releases/tag/ui-v0.10.0
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/ui-v0.1.0
