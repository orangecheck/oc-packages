# Changelog

## [0.5.7] — 2026-10-16

- `UsdApprox` rounds to cents. An amount under half a cent reads "< $0.01"
  instead of "≈ $0.0012", which read as false precision beside a sats figure.

## [0.5.6] — 2026-10-15

- `Field` takes an `action`: a button set beside the control (below it on a
  phone), so an input with its own button keeps its label, hint and error
  wiring instead of being laid out by hand.

## [0.5.5] — 2026-10-15

- `Prose` spacing and list rules skip anything inside `.not-prose`, so a
  `Notice` or card set in long-form text keeps its own layout. A notice title
  no longer picks up a paragraph margin and drops below its dot.

## [0.5.0] — 2026-10-15

- `SiteFooter` closes every page with the mark and the wordmark at display
  size, sized to the viewport so it never overflows; `signature={false}`
  leaves it out.

## [0.4.2] — 2026-10-15

- `SplitBar`: a share under 30% sets its figure smaller, so it fits its segment
  in a narrow card as well as a wide band.

## [0.4.1] — 2026-10-15

- Every page's opening settles in once on load (`oca-enter`, staggered through
  eyebrow, title, lead, actions and art). CSS only: it plays without script and
  stops under reduced motion.
- `SectionIntro` rises into place the first time it scrolls into view;
  `reveal={false}` keeps it still. It now takes only `className`, `style` and
  children, so an attribute it would drop is a type error.

## [0.4.0] — 2026-10-15

The signature pieces, so ochk.app can look like the deck feels instead of
like a slide pasted on a page.

- `HalftoneCanvas` and `HalftoneSphere live`: the deck portrait screened live
  on a 45° dot screen. It grows in from the centre, breathes, and parts around
  the pointer like a finger through sand. It sleeps offscreen, draws once and
  still under reduced motion, and keeps the static screen as the no-script
  fallback. The sphere gains a gloss and a floor shadow.
- `Crowd story` and `ScrollStory`: a pinned section sets `--p` as you scroll;
  the copies fall away one by one and the real figures grow and glow. Pure CSS
  variables, so scrolling re-renders nothing.
- `Reveal`, `Ticker`, `useInView`: content rises into place the first time it
  is seen; numbers count up from below the fold. Nothing on screen at load
  moves, and nothing is hidden without script.
- `PhoneFrame`, `BrowserFrame`, `FloatChip`: the product shown as an object.
- `IsoCheck tilt`: the check turns a few degrees toward the pointer under a
  warm light.
- A `Pages/Home` story composes all of it as the reference for ochk.app's home.

## [0.3.2] — 2026-10-15

- Sets `--oc-signin-arrow: none`, so the sign-in ceremony's submit labels carry
  no trailing arrow (auth-client ≥ 2.29) without a per-page override.

## [0.3.1] — 2026-10-15

- `ScrollFade` and `DocLayout` work where `ResizeObserver` or
  `IntersectionObserver` does not exist (old engines, jsdom tests).

## [0.3.0] — 2026-10-15

The patterns that made every page past the home page look unfinished, fixed
once here. Additive: every 0.2 call site still compiles.

- `PageHero` (public pages): eyebrow, display title, one-line lead, actions,
  optional art; `size="xl"` is the home page's. `variant="document"` and
  `DocHeader` + `DocLayout` (sticky table of contents on desktop, folded on a
  phone) for pages read top to bottom. A document's h1 is display-2, its h2s
  display-3, so the title is never smaller than its sections.
- `AppShell` takes `sections` (`{ id, label, title?, href, groups }`) and
  `persistent` groups. The sidebar shows a section switcher and only the
  current section's pages, so it fits a 900px screen without an inner scroll.
  On phones: wordmark in the top bar and a section › page strip under it. One
  content width (72rem) for every signed-in page. Duplicate page labels warn in
  development. `nav` still works.
- `PageHeader` takes its eyebrow from the shell's section; `eyebrow={null}`
  omits it.
- `StatGrid`: two to a row on a phone; the last tile fills its row, so a grid
  never ends in a hole; values line up whatever the labels wrap to. Give each
  `StatCard` a `raw` number and a grid of zeros becomes one `EmptyLine`
  (`empty` text, or force it with `isEmpty`).
- `DataTable`: `numeric`, `width`, `minWidth`, `truncate`, `primary` and
  `hideOnPhone` columns. Too wide, it scrolls with an edge fade; under 640px it
  becomes cards that keep every column's label (`phone="scroll"` opts out).
- `CodeBlock`: a header with its caption and a copy button, a dark well that
  scrolls sideways instead of cutting lines, `maxLines` to fold long samples.
- `Notice` has three looks: neutral, the orange accent (attention) and red (a
  real error). `info` and `success` render neutral, `warning` renders the
  accent, so no page can add a fourth colour. No tinted fills.
- `Badge`: `success` is a neutral pill with a green dot; `warning` and `info`
  alias the accent and neutral.
- `LoadingBlock` and `useTimedOut`: a loading state turns into a message with
  a retry after 12 seconds instead of spinning forever. `Skeleton` is visible
  on the canvas in both modes.
- `ScrollFade`: the sideways scroller tables, code and tabs use. `TabsList`
  scrolls on a phone with an edge that says there is more.
- Disabled buttons are one quiet grey pill in every variant.
- `Field`: hints sit under the control, so paired fields stay level;
  `optional` marks a field beside its label.
- `EmptyState` takes an `icon` and no longer shows the logo by default.
- `TruthTable` stacks status over text on a phone.
- `SiteFooter`: two link columns on a phone.
- Tokens: field borders 3:1 against the card (light `#8f8f8f`, dark
  `#6a6a6a`); in dark, a lifted secondary button, a lighter ink band with a
  hairline, and a code surface darker than any card. New `--oca-code-surface`,
  `--oca-code-line`, `--oca-band-line`, `--oca-skeleton`; their pairs are in
  the contrast check.

## [0.2.1] — 2026-10-15

- `SplitBar`: a small share keeps its figure inside its segment on a phone.

## [0.2.0] — 2026-10-15

- The hero sphere draws its stadium inside its own box, so the art can no longer
  reach into the headline beside it. The ball is lit from the upper left with a
  saturated rim, and the portrait is re-screened from the red channel: the
  orange no longer turns into a field of faint dots.
- `StatusPill`: one honest line with a live dot, for where something stands.
- `Crowd`: identical figures in perspective with a few real ones, for the
  bot-farm problem.
- `SplitBar`: where a payment goes, as one bar.

## [0.1.2] — 2026-10-15

- Sets `--oc-signin-*`, so the family sign-in ceremony (auth-client ≥ 2.27)
  renders in the app's type: sentence case, pill buttons, rounded fields.

## [0.1.1] — 2026-10-15

- The hero stadium is the deck's rounded square beside the sphere, not a tall
  pill around it. On the live page the pill's curve cut through the headline.

## [0.1.0] — 2026-10-15

First release: the ochk.app design system from Souheila's partner deck.

- Tokens for light and dark, scoped to `data-oc-app="ochk"`. The deck's orange as
  text (2.81:1) is replaced by two darker shades of the same hue for display and
  small text; fills keep it.
- Inter (weight and optical size) and JetBrains Mono, self-hosted with
  metric-matched fallbacks.
- The isometric check measured from the deck, the app icon, the lockup, and the
  halftone sphere with `scripts/halftone.py` to make its dot layer.
- Primitives on Radix, composites for every slide of the deck, and the public and
  signed-in chrome.
- Contrast and isolation checks as `yarn test`.
