# Changelog

All notable changes to **`@orangecheck/design`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Token, skin and component
changes that are visible to a user are called out explicitly — a design system
bump that silently moves a colour is worse than a breaking one.

## [0.32.2] — 2026-09-25

### Changed — form fields are 16px on phones, whatever the call site says

iOS Safari zooms the page when a field under 16px takes focus. The primitives
already used the `text-base md:text-*` ladder, but call sites that passed
`text-xs` or used a raw `<input>`, `<textarea>` or `<select>` still rendered at
11–14px on eleven pages across lock, stamp, agent, pledge, attest and vote.
`styles/theme.css` now sets every text-entry field to 16px below `md`, outside
any `@layer`, so no utility can undercut it. Desktop sizes are unchanged.

### Changed — footer links are 44px tap targets on phones

`OcFamilyFooter` column links and legal links were 16px tall on phones. Below
`md` each one is now at least 44px tall, and the column links are at least 44px
wide. The columns drop their `space-y-2` gap there, so the list is taller
by padding, not by extra gaps. Desktop density is unchanged.

### Changed — quiet chrome text is full muted tone

Small chrome text was dimmed with `text-muted-foreground/NN`. Muted text sits
at 5.25:1 or better in every skin and mode, and any opacity under 1 takes some
skin below WCAG AA's 4.5:1 (ember light at 0.8: 3.54). Every opacity modifier on
muted text is gone: the `LayoutSubHeader` capability tags (were /55),
`OcFamilyFooter` legal links (/80), `DashboardShell` tool-row sublabels and
section labels (/60), and the account menu, logo dropdown, card, modal,
pagination, stat-grid and section-header labels. Hierarchy now comes from size
and case. `yarn test` (`scripts/check-a11y-floors.mjs`) fails the build if a
`text-muted-foreground/NN` or a layered field floor comes back.

## [0.32.1] — 2026-09-25

### Changed — the sigil is quieter on phones

On phones `OcSigil` re-anchors top-right, where it can sit under a hero
headline. At its phone opacity (0.34 light, 0.42 dark) a headline set in the
primary colour lost glyphs against the mark: on vote.ochk.io at 390px the
"×" of "sats × days" disappeared. Phone opacity is now 0.16 light and 0.18
dark. Desktop is unchanged, and `--oc-sigil-opacity-sm` still overrides it
per site.

## [0.32.0] — 2026-09-11

### Added — `Acknowledgement`

The credit line every landing page is supposed to carry in its bottom-CTA
section, crediting Bram Kanstein for the "bitcoin as sovereignty layer" lineage.

It is a component rather than seven copies of a `<p>` because it was seven
different things. Four of the seven family sites (attest, stamp, agent, www)
had **no credit at all**, and the three that did disagreed on wording,
placement and weight: lock had it in the bottom CTA as the voice rule
specifies, vote had it in the hero as a bare icon link whose only label was a
`title` attribute, and pledge had it in the footer at 10px and 40% opacity. An
attribution that is technically present but unreadable is not an attribution.

`tone="onBrand"` for the normal case, since a bottom CTA usually sits on a
`BrandBand`. `ACKNOWLEDGEMENT_URL` and `ACKNOWLEDGEMENT_NAME` are exported so a
site that needs a different layout still points at one source of truth.

## [0.31.1] — 2026-09-07

### Changed

- **`next` peer widened to `^15.0.0 || ^16.0.0`.** Every consuming site moved
  to next 16.3.4 on 2026-09-07 — next 15.5.x pins a postcss with an open
  advisory in every patch release, and only next 16 depends on a fixed one —
  so a `^15.0.0` peer made all seventeen installs warn. Nothing in this
  package's runtime changed; the peer was simply narrower than the truth.

## [0.31.0] — 2026-09-04

> This entry was written on 2026-09-07. 0.31.0 was published without one,
> which is the failure this file's own preamble exists to prevent — and it
> hid a breaking type change behind a minor.

### Removed

- **`'fleet'` is gone from `FamilySlug`, the ecosystem switcher and
  `family-properties`.** fleet.ochk.io is retired. This removes a member from
  an exported union type, so any consumer narrowing on `'fleet'` stops
  compiling — **breaking, and it shipped as a minor.** In practice nothing
  did: the family switcher renders from the table rather than from literals.
  Recorded rather than quietly renumbered, because the point of a changelog is
  that the mistake is findable.

## [0.30.1] — 2026-09-03

### Changed

- **`OcErrorPage`: icons on the buttons, and `actions` accepts nodes.**

  Both come from migrating `oc-attest-web` — the site the component was lifted
  from — and finding the promotion would otherwise have been a downgrade for
  it. Its buttons carried `Home` / `RefreshCw` / `ArrowLeft` glyphs, and its
  500's action list ended with "persisting? report it on **github**", a real
  link inside a list item.

  `actions` is now `ReactNode[]` rather than `string[]`, so an item can carry a
  link. `string` is a `ReactNode`, so this is not a breaking change.

  Worth stating as a principle: when a component is promoted out of one site
  for everyone to share, the site it came from should not end up with less than
  it had. That is the test of whether the promotion was real or just
  centralisation.

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
