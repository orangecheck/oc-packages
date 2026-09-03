# Changelog

All notable changes to **`@orangecheck/design`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Token, skin and component
changes that are visible to a user are called out explicitly — a design system
bump that silently moves a colour is worse than a breaking one.

## [0.30.0] — 2026-09-03

### Added

- **`OcErrorPage`** — the family's 404 / 500 body.

  Nine of thirteen family sites had no error page at all and fell through to
  Next's unstyled default: no header, no footer, no theme, none of the chrome
  every other page on the site has. It is the one page a visitor is guaranteed
  to reach eventually, and it was the only one that looked like a different
  product.

  Lifted from `oc-attest-web`, which was the only site with a good one. It
  lives here rather than being copied nine times because a copied page drifts —
  that is the lesson of the family's `isFamilyUrl` predicate, where 14 of 15
  hand-copied versions shared a flaw the 15th had already fixed.

  ```tsx
  // a site's 404.tsx, in full
  'use client';
  import { OcErrorPage } from '@orangecheck/design';
  import { Seo } from '@/components/layout/Seo';

  export default function NotFound() {
      return (
          <>
              <Seo title="Page Not Found" description="…" noindex />
              <OcErrorPage variant="not-found" />
          </>
      );
  }
  ```

  `variant` picks the defaults: `not-found` is the 404 shape (primary tone, a
  "go back" affordance), `server-error` the 500 shape (destructive tone, a
  retry affordance and a what-to-do list). Every piece of copy is overridable,
  and `homeHref` matters for sites whose real root is app-scoped rather than
  `/`.

  `Seo` deliberately stays with the consumer — a page's title and `noindex` are
  site concerns and this package has no business owning them.

## [0.29.1] — 2026-09-03

### Fixed

- **`Textarea` zoomed the viewport on iOS Safari.** It hardcoded `text-xs`
  (12px) with no responsive step, and iOS zooms when a focused form field's
  text is under 16px — leaving the user zoomed in afterwards. Every textarea in
  the family did this. Now `text-base md:text-xs`: 16px on mobile, the 12px
  mono look preserved on a pointer device, where the behaviour does not exist.

  `Input` already used this ladder (`text-base md:text-sm`); `Textarea` was the
  one that missed it, which is why the family's own rule — "every form field
  needs ≥16px text on mobile, use the `text-base md:text-{xs|sm}` ladder" —
  was being broken by the primitive that is supposed to enforce it.

  A consumer passing `text-xs` via `className` still re-breaks it, since
  tailwind-merge lets the caller win; the docstring now says so. Four such
  overrides were found and fixed in the consumer repos alongside this
  (oc-www's sudo signature field, two attest verify textareas, three stamp
  inputs).

## [Unreleased]

- _(no pending changes)_

## [0.29.0] — 2026-09-03

### Fixed

- **`orangecheck` light-mode accent failed WCAG AA.** `--primary` on
  `--background` measured **2.93:1** against the 3.0 floor `verify:contrast`
  gates — the only failure across all ten skin × mode combinations. Every
  sibling skin already cleared 4.5 (ember 5.10, lightning 6.44, gold 5.39,
  phosphor 4.92), so `orangecheck` was the outlier rather than the standard.

  `--primary` is now `oklch(0.56 0.2 55)` — **4.73:1**, inside the sibling band.

  The label had to move with it, and this is the part worth understanding: a
  darker primary drops a near-black `--primary-foreground` to 4.16:1, and there
  is no single lightness where an accent on white AND a black label both clear
  4.5 — they pull in opposite directions. So light mode adopts the pairing
  ember and phosphor-light already use: darker primary, near-white foreground
  (**4.80:1**). Dark mode is untouched; it inverts that pairing correctly and
  measures 7.57 both ways.

  **Visible change:** `orangecheck`'s light accent is a deeper burnt orange.
  Hue (55) and chroma (0.20) are unchanged, so it reads as the same colour,
  darker. `--brand` — the full-bleed band token — is untouched.

### Changed

- `verify:contrast` and `verify:themes` headers now document `SB_BASE`. Both
  already supported it; the headers said only "serve storybook-static on :6007
  first", which reads as though the gates cannot be run in a workspace that
  does not start local dev servers. They can:
  `SB_BASE=https://design.ochk.io yarn verify:contrast`. The localhost default
  stays for CI, which should build and serve the static bundle so the gate
  tests the code rather than whatever is currently deployed.

## [0.28.14] and earlier

See git history. This file starts at 0.29.0 — the package had no CHANGELOG
before, which is how a visible token change nearly shipped with no record of
it beyond a commit message.
