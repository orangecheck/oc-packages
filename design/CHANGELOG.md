# Changelog

All notable changes to **`@orangecheck/design`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Token, skin and component
changes that are visible to a user are called out explicitly — a design system
bump that silently moves a colour is worse than a breaking one.

## [0.34.1] — 2026-10-08

### Fixed — phone footer: one rule, not two

On phones, the disclosures' bottom rule and the legal bar's top rule sat 32px
apart. The legal bar now uses the last disclosure's rule, and the phone gaps
are tighter.

Phone footer height at 390 (light and dark measure the same):

| Site | Before 0.34 | 0.34.0 |
| --- | --- | --- |
| vote | 1,227px | 528px |
| attest | 1,261px | 562px |
| me | 1,144px | 577px |

This release takes about 40px more off each.

### Fixed — a hover colour no longer exempts dimmed text from the floor

`text-brand-foreground/80 hover:text-brand-foreground` stayed at 3.55:1 at
rest, as on me.ochk.io's band links, because any `hover:` exempted it. The
floor now skips only an element that is currently hovered, so its hover colour
still shows. `group-hover:` and the other state variants are still exempt.

## [0.34.0] — 2026-10-08

### Changed — Pagination takes `pageIndex`, and the base is in the name

`page` was zero-based, but the name did not say so. Four of six call sites
passed 1-based numbers, so page one rendered "11–20 of 20", prev showed an empty
list, and me.ochk.io's admin could never reach rows 11–20.

- The prop is now `pageIndex`, zero-based. `onPage` receives the next index.
- `page` still works for this minor and warns once in development.
- An index past the last page clamps to it and warns that the index is
  zero-based.
- `scripts/check-pagination.mjs`, run by `yarn test` against the built dist,
  renders each case and checks the label and button states. It fails against
  0.33.3.

### Changed — ember dark: primary and status text clear AA on muted surfaces (visible)

Real pages put `text-primary` on `bg-muted`: zebra rows, table heads and tier
chips. In ember dark that measured 3.54:1 on vault /pricing and in docs tables.

- ember dark `--primary` goes to `oklch(0.68 0.162 42)` and `--destructive` to
  0.69.
- `--muted` goes down to 0.28, still above the card.
- The token gate now checks coloured text on muted as well. Only ember dark
  failed it.

### Changed — the footer fits a phone

With 44px links in one column, the footer ran 1,144–1,261px at 390, longer
than many pages. Below `sm`, each link group is now a disclosure with its links
two to a row, still 44px.

### Changed — 44px controls on phones

- The account-menu trigger, sign-in button, account chip, appearance menu, the
  dashboard-shell tools button, its "§ dashboard" link and the drawer close are
  44px boxes below `md`. The header has room for them.
- Switch and the HelpHint trigger keep their visual size and get the 44px hit
  area that CopyButton, Card expand and the dialog and sheet closes already
  have (`.oc-hit`). Their box still measures small; a tap 10px outside it lands.
- TabsTrigger is `min-h-11` below `md`.

### Fixed

- StatGrid lays out 2 and 4 columns as two per row on phones. Four short
  numbers no longer fill a whole screen.
- StatTile stretches to its grid row, so a shorter tile shows no border-coloured
  band under it.
- PromptHost's message wraps anywhere. A 64-hex id no longer overflows the
  dialog by 107px at 390.
- `styles/swagger.css`: method badges were white on light fills (GET 2.3:1,
  PATCH 1.6:1). They now keep their hues at 5.2:1 or better. The version pills
  and the Authorize and info links use tokens.
- Dev only: sharp 0.35.5 and source-map-js 1.2.2 in the Storybook toolchain.

## [0.33.3] — 2026-10-08

### Fixed — the dimmed-text floor skipped anything with a responsive size

0.33.2 exempted any element with a variant `:text-` class, so the floor kept
working for hover and data states. That also caught responsive sizes like
`sm:text-base`. So the band body copy every BottomCta writes
(`text-brand-foreground/80 text-sm sm:text-base`) stayed at 3.55:1 on chat,
lock and cosign. The exemption now names the state variants instead: hover,
focus, active, `data-[…]` / `aria-*`. Simulated on the live homepages of
attest, vote, lock, agent, pledge, vault, chat, cosign and stamp at 390, the
only remaining contrast misses are two attest glyphs dimmed with `opacity-60`.

## [0.33.2] — 2026-10-08

### Fixed — font fallbacks fitted to how phones render (visible on slow loads)

The 0.33.0 fallback widths were measured on a hinted Linux render, which rounds
glyph advances and skews widths by 2–4%. iOS, macOS and Android lay text out
unhinted. On those devices the 0.33 mono fallback came out 4% wider than
JetBrains Mono: unhinted, both advance 0.6em, and only a hinted render rounds
JetBrains up to 0.625em. Hanken's regular fallback was 2.5% narrow.

- Every Hanken face is refitted with hinting off. Mono goes back to 100%; the
  face now only matches JetBrains' vertical metrics.
- Uppercase is a different fit. Hanken's capitals run 7–8% narrower than
  Arial's, so an uppercase CTA that fits one line in Hanken wrapped to two in
  the fallback. That was the agent and vote hero shift. `Hanken Grotesk Caps
  Fallback` is fitted to capitals. Under ember, `.font-display.uppercase` uses
  it via `--oc-font-caps`, and the other skins unset that variable.

Measured on the live pages with this CSS patched in, at 390px with throttling,
over 3 unhinted runs:

| Page | Before (0.33.1) | After |
| --- | --- | --- |
| agent | 0.13–0.18 | ≤0.004 |
| vault | 0.015 | 0 |
| pledge /verify | 0.001 | 0 |
| vote | 0 | 0 |

The pledge /verify paragraph still re-wraps on a hinted Linux render (0.13).
That is the lab's rounding, not a phone's.

### Changed — dimmed muted text renders at the full muted tone, family-wide

`text-muted-foreground` sits just over 4.5:1 by design, so any opacity modifier
takes it under AA. Family sites carried about 1,300 of them: 716 in me, 128 in
analytics, 121 in vault. A new unlayered rule in `theme.css` renders those
forms at full muted. The same applies to `text-brand-foreground/NN` on a
`.bg-brand` band, except in h1–h3, where the lighter display phrase only needs
3:1. Elements that also carry a variant text colour (`hover:`, `data-*:`) are
left alone, so active and hover states still work, and so are form fields and
`aria-hidden` decoration. This replaces the footer-only floor from 0.33.0.

### Fixed

- `.docs-prose code` uses `accent-foreground` on its primary tint. In
  ember-dark zebra table rows primary measured 3.1:1; accent-foreground holds
  at least 5.6:1 on any surface.
- Card and Modal title rows: the title truncates only when it alone overflows.
  The 1-vs-100 shrink ratio still shaved it ("§ distributi…" on analytics).
- DefinitionList values wrap with `overflow-wrap: anywhere` rather than
  `break-all`, so prose keeps its words whole.
- The OcDashboardShell sidebar is `max-h` rather than `h`, so it sizes to its
  links instead of filling the viewport with an empty card.
- Dev only: `next` 16.3.8 (GHSA-vcvr-r3jv-pc5j) and brace-expansion 5.0.12 in
  the Storybook toolchain.

## [0.33.1] — 2026-10-07

### Fixed — what the live Storybook pass on 0.33.0 still found

- **FeatureCard on a band**: body text was `text-muted-foreground` in every tone,
  1.2–3.1:1 on the band. It now follows the band. IconBadge `onBrand` uses the
  gated brand pair, so the numbered-step digits measure 4.6:1, up from 3.3:1.
- **ComparisonTable**: the "ours" header uses `text-accent-foreground` on its
  peach tint. It was 4.2:1 in ember dark.
- **orangecheck dark**: muted text on the terminal title strip was 4.47:1. Muted
  is now lifted a little, and the token gate checks the strip.
- **BitcoinAddress `full`**: the address breaks instead of widening a phone page.
  `.oc-hit` grows its hit area leftward, so a control at the end of a line
  cannot add horizontal scroll.
- **Header menus have a keyboard model**. These six menus hand-rolled their own
  dismiss logic:
  - the appearance menu and the theme picker
  - the logo dropdown and the ecosystem switcher
  - the account menu and the mobile account menu

  They now share `useMenu`. Opening moves focus to the first item; arrows and
  Home/End move between items; Escape closes the menu and returns focus to the
  trigger.
- Stories carried the same dimmed text the components shed: the ember showcase,
  the StatusPill and the sigil band.

## [0.33.0] — 2026-10-07

### Changed — every text token clears 4.5:1 in every skin and mode (visible)

Measured on the live sites, several tokens failed WCAG AA as text:

- ember dark `text-primary` was 3.65:1. It is on every eyebrow and footer
  column label.
- The status tokens were 3.1–4.4:1 in most light skins.
- Filled badge labels went as low as 2.6:1.
- White on the ember band was 3.5:1.

`scripts/check-token-contrast.mjs` now runs in `yarn test`. It checks the pairs
that carry text: foreground and muted on background, card and muted; primary
and the status tokens on background, card and their own 12% tint; and every
`*-foreground` on its fill. It failed 77 pairs before this release and passes
all of them now.

To get there:

- **ember dark primary** is a lifted terracotta, `oklch(0.64 0.162 42)`, with a
  dark label. No shade carries both a white label and 4.5:1 text on near-black,
  so dark mode now works the way the other four skins already did.
- **The ember band** (`--brand`) is one step deeper, `oklch(0.57 0.158 42)`, so
  the small white copy on it reads.
- **Warning chips** take a white label on a darker amber, in every light skin.
- **Status colours** in light mode are 0.03–0.1 L darker.
- **Destructive and info labels** in dark mode are dark.

Composites that put text on the band now use `text-brand-foreground` at full
strength instead of `text-primary-foreground` at 70–80%. That covers
MarketingHeading, EmailCapture, AccentNote, Acknowledgement, CheckList and
NumberedStep. Under ember dark, primary-foreground is now the dark label, which
would have put dark text on the band.

The Button destructive variant uses the gated `destructive-foreground` pair in
both modes. It no longer uses `text-white` over a 60% fill.

The a11y-floor guard now rejects opacity modifiers on any near-floor text token,
not only muted. The only opacity it still allows is on display-size text.

### Changed — text no longer re-wraps when the web fonts arrive

Layout shift on vault (0.20), agent (0.12), pledge /verify (0.13) and vote
(0.09) was all font swap. Blocking the woff2 files dropped every page to 0.004
or less. There were two causes:

- **Hanken's fallback had one regular face.** Bold headings were 9% narrower
  until Hanken arrived. The fallback is now five faces per weight band, each
  fitted on family copy (regular or bold Arial / Liberation Sans).
- **Mono fell through to the system monospace.** Those fonts advance 0.6em, but
  JetBrains Mono advances 0.625em. `OC Mono Fallback` scales the local mono to
  match.

The skins now share `--oc-stack-sans` / `--oc-stack-mono` from `fonts.css`. The
`var(--font-*-display)` they used to wrap resolved on `:root`, where no site
defines it, so those wrappers never did anything.

### Changed — footer brand block: 44px links, AA meta text

Sites pass tagline and meta copy into `OcFamilyFooter`. On phones, links in that
copy were 13–18px tall. Meta lines dimmed with `text-muted-foreground/60` or
`/40` measured 1.7–3.6:1 on eleven sites. The brand block is now
`.oc-footer-brand`, and two unlayered rules cover it. Its links get vertical
padding up to 44px on phones without moving a line. Opacity-dimmed muted text
renders at the full muted tone. No site change is needed.

### Changed — 44px tap targets on phones

Below `md`, Button (every size), Input and the Select trigger get `min-h-11`. A
call site's `h-*` still sets the desktop size. Some controls are drawn small on
purpose and only their hit area grows, through the new `.oc-hit` class, so
nothing moves:

- the CopyButton, Dialog, Sheet and Modal closes, and Card expand
- the account-menu triggers, the appearance menu and the logo dropdown

### Fixed

- `styles/swagger.css`: Swagger's 12–14px fields outranked the 16px phone floor
  (attest /api-explorer measured 14px). It now restates the floor.
- ErrorBoundary no longer shows `error.message` to users. The default is
  "something went wrong" with reload and home. The raw message shows only when
  `NODE_ENV` is `development`.
- Dialog, ConfirmHost and PromptHost scroll when taller than the viewport. Sheet
  scrolls, and top and bottom sheets cap at 85dvh.
- A second `confirm()` / `prompt()` resolves the first, which used to await
  forever. PromptHost now:
  - ties its labels to its fields
  - sets `aria-invalid` and announces its error
  - submits on Enter only from a field
- The Toaster has a close button and a 6s duration.
- CopyButton says "copy failed" when the clipboard refuses, and announces both
  outcomes.
- Pagination clamps a stale page, so it can no longer show "51–50 of 50". It is
  now a labelled nav.
- DataRow wraps long hashes. AlertTitle no longer clamps to one line. The
  countdown in AlertWithCountdown no longer re-announces every second. TabsContent
  shows a focus ring.
- Skeleton is `bg-foreground/10`. `bg-muted/40` was invisible on cards.
- `Surface tone="onBrand"` is a framed tile. The lightened fill put its text at
  2.7:1.
- Menus close on `pointerdown`, so a tap outside closes them on iOS.
- Storybook opens on ember, the family default.

## [0.32.4] — 2026-09-25

### Changed — ember text no longer re-wraps when Hanken Grotesk arrives

Hanken loads with `font-display: swap` and nothing in the stack matched its
metrics, so pages first laid out in the system face and re-wrapped when Hanken
landed: me.ochk.io's hero measured a cumulative layout shift of 0.13. `fonts.css`
now declares `Hanken Grotesk Fallback`, local Arial scaled to Hanken's average
advance and vertical metrics, and ember's `--oc-font-sans` lists it second. With
the font held back, the hero paragraph lays out at 610px wide and 88px tall,
against 605px and 88px once Hanken arrives. The final rendering is unchanged.

## [0.32.3] — 2026-09-25

### Added — `styles/swagger.css`, Swagger UI in dark mode

The API explorers on ochk.io and attest.ochk.io, and the embedded references on
docs.ochk.io, render Swagger UI, whose stylesheet is light-only. In dark mode
its body text sat at about 1.6:1 against the page and the Servers band was a
white slab. The new opt-in stylesheet maps Swagger's hard-coded text, border
and fill colours onto the skin tokens under `.dark`. Light mode is unchanged.
Import it after `swagger-ui-react/swagger-ui.css`.

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
