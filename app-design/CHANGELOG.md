# Changelog

## [Unreleased]

## [1.2.2] — 2026-10-20

The ESM build imports `next/link.js` instead of `next/link`. A bundler resolving an
`.mjs` file requires fully specified paths, so any site that did not add app-design
to `transpilePackages` failed to build. `scripts/check-esm.mjs` now fails the tests if
a bare `next/*` import reaches `dist/*.mjs`.

## [1.2.1] — 2026-10-20

- `SiteHeader`: between md and lg the row's gaps and the navigation's padding
  are tighter. With the family menu beside the lockup, ochk.app's four links
  and its account control needed 730px of a 715px row at 768px, so "How it
  works" broke onto two lines. They now take 698px.

## [1.2.0] — 2026-10-20

- `SiteFooter legal` takes a list of links as well as `true`. `true` still links
  ochk.io's documents, which cover the free protocols. A product that holds
  money hosts its own (ochk.app, vault: `@orangecheck/legal` builds theirs from
  their own profile), so its row must link those: pass
  `SELF_HOSTED_LEGAL_LINKS` (`./family`), its own Privacy, Terms, Security and
  Contact, with Trademarks on ochk.io. A link to the site's own page goes
  through the router.

## [1.1.1] — 2026-10-20

- `ProtocolGrid` shows a straight arrow when it links to a protocol's page or docs on
  ochk.io, and the outward arrow only when it links to a tool on another host.
- The registry no longer lists cosign as showing OC Attest: it signs in with an
  orangecheck account and a wallet and uses none of the six directly.

## [1.1.0] — 2026-10-20

The docs shell and the tool shell (steps 2 and 3 below). Also: contextual alternates are
off family-wide, because Inter drew "5x7" as "5×7" and so changed Bitcoin addresses shown
in running text.

### Added: code colours and the wallet's look

- Syntax tokens for code, which is a dark well in both modes:
  `--oca-code-keyword` (and tags), `-string`, `-number` (and constants),
  `-function` (and links), `-type`, `-property`, `-comment`, `-punctuation`,
  `-added`, `-removed`, from the deck's code card. Marked lines get their own
  surfaces: `--oca-code-mark`, `-added-line`, `-removed-line`. Each colour
  clears 4.5:1 on the well, on the dark card and on every marked line, in
  light and dark; `yarn test` checks all 53 new pairs.
- `styles/code.css` draws the token classes and the marked lines, only inside
  a CodeBlock's well, where the colours were measured.
- `--oc-wallet-*`: font, case, tracking, scale, weight, radii, height,
  surface, the ready dot, the signature field's size (16px, so iOS does not
  zoom) and the decorative marks, so wallet-adapter's picker and
  sign button can take this design the way auth-client's ceremony reads
  `--oc-signin-*`. Inert until wallet-adapter reads them.

### Added: the docs

What ochk.io/docs needs to move onto the system:

- `./code`: `rehypeCode`, a rehype plugin that highlights every fence at build
  time and reads its meta (`title="…"`, `{2,4-6}`, `diff`, `showLineNumbers`).
  The highlighter is the package's own: no dependency, synchronous, so code
  is coloured in the server's HTML. It reads TypeScript and JavaScript (with
  JSX), JSON, shell, Python, YAML and diffs; anything else stays plain. It
  never changes a character: every token joined back is the source, checked
  on all 1,169 fences in the docs. Measured on the docs' 1,319 pages: compile
  time within noise of no highlighting, compiled output +4.5%.
  `@shikijs/rehype` cost +2.5 to 3.5 s and +56% output, because it emits an
  element for every token; shiki's tokens through `rehypeCode` (its
  `tokenize` option) cost +0.7 s and +6.6%. Each block travels as one
  string, not a call per word.
- `CodeBlock` takes `html` (from the build) or `children` (another
  highlighter) as well as `code` and `lang`, and marks lines (`highlight`),
  shows a diff (`diff`, or `lang="diff"`), numbers lines (`lineNumbers`) and
  takes `actions`. Marks and signs are drawn, so copying takes the code as
  written; a shell transcript copies its commands without the `$ `.
- `CodeTabs` (`items`, `syncKey`: choose pnpm once and every set on the page,
  and the next, follows) and `InstallTabs` (`pkg`, `dev`).
- `DocsShell`: ochk.io's header with Docs marked (`DOCS_HEADER_NAV`) and
  `search` and `actions` slots, `DocsNav` on the left, the page, "On this
  page" on the right from xl; below lg the sections open from a bar under the
  header. `DocsNav` (`sections`, `current`): sections fold, the current one
  stays open, the page is marked with a bar, badges take status words.
- `Breadcrumbs` (`items`, `action`), `DocsPager` (`prev`, `next`, each with an
  optional section), `OnThisPage` and `useHeadings` (reads a page's h2s and
  h3s again after each move), `TocItem.level`.
- `./mdx`: `mdxComponents` and `createMdxComponents({ mermaid })`. Headings
  carry a "#" link to themselves, tables become `MdxTable` (hairlines,
  sideways scroll, code cells without pills), blockquotes become notes,
  fences become `CodeBlock`s, and mermaid fences become `Diagram`s when a
  loader is given. `Callout` (note, warning, danger; a note to a screen
  reader, never an alert), `Steps`/`Step`, `LinkCard`/`CardGrid`, `ApiTable`
  (name, type, required, default, description; cards on a phone).
- `Diagram`: mermaid in the page's own colours, drawn again when the page
  turns light or dark, at its own size (it scrolls rather than shrinking its
  labels). The package does not depend on mermaid: pass `load`.
- `SearchDialog` and `SearchButton`: a field, grouped results, ⌘K or / to
  open, arrows and Enter, focus back where it was on close. It knows nothing
  of the index: `onQuery(query, signal)` returns the results (Pagefind's
  excerpt markup goes in `excerptHtml`). `defaultQuery` opens it with `?q=`.
- `ProtocolGrid link="docs"`. `Notice` takes a `role`.

### Fixed

- A context set in one entry now reaches a reader in another. Each entry is
  bundled on its own, so `AppShell` (from `./chrome`) and `PageHeader` (from
  `./components`) each had their own copy, and `PageHeader` never got the
  section as its eyebrow. ochk.app passes an eyebrow on 24 of 25 pages; the
  one that does not (`ProjectFrame`) shows its section after this update.
- A `Select` inside a `Field` is named by the field's label and described by
  its hint. `Field` hands its id to its child, and Select's root draws no
  element, so no select in the package had a name.
- `AccountMenu`'s button is read as its name ("you@example.com, account
  menu"), and its initial is drawn rather than written, so what it says
  matches what it shows.

### Added: the tools

What the six protocol sites need to move onto the system:

- Compact density: `Input size="sm"` and `SelectTrigger size="sm"` (36px, 16px
  text on a phone still), `DataTable dense`, `StatCard size="sm"`,
  `KeyValueList dense`. `DensityProvider` sets it for everything inside,
  dialogs included; a prop on one component wins.
- `ToolShell` (`protocol`, `tools`, `home`, `account`, `rail`, `railFooter`,
  `variant: 'tool' | 'app'`, `banner`, `footer`): a slim header with
  "orangecheck | stamp", the family menu, the tools as a line nav, "About
  stamp" on ochk.io, the status when not live, the theme and the account;
  compact density; the compact family footer. On a phone two to five tools
  become a tab bar. `app` fills the window with no footer.
- `SiteHeader` takes `navOnPhone` and `menu`, and marks the tool header's
  active item with a bar on its bottom edge.
- `SessionAccountView` (chrome) and `SessionAccount` (`./session`, reading
  `@orangecheck/auth-client`, now an optional peer): the account menu, "Sign
  in", or, while the session is checked, the button's place held unseen.
- `ToolGrid`, `ArtifactView` (formatted or raw, copy, download the raw
  bytes), `DropZone` (drop, choose or paste; says the file stays in the
  browser; hashing progress), `FormSection` (numbered, done, current, upcoming,
  blocked), `StateBadge` and `createStateBadge` (a protocol's lifecycle words
  on fixed looks), `AnchorStatus`, `BlockHeight`, `BlockCountdown`, `Meter`
  (with a hatched part for pledged, not settled), `FilterChips`.
- `CopyButton` takes `clearAfter` (wipes the clipboard if it still holds the
  copy), `onCopied`, and a `value` read at the moment of copying.
  `HashChip` takes `explorer` and `network` for a mempool.space link.
- `./format`: `explorerUrl`, `shortenMiddle`, `formatBlockHeight`,
  `blocksToDuration`, `formatUtc`, `formatBytes`. No React.
- `KeyValueList` lays its rows out by its own width, not the screen's, so a
  list in a narrow card stacks. `VerifyReport` takes `as` (its title is an h2
  by default, under a page's h1).

## [1.0.0] — 2026-10-20

The family design system. Every orangecheck site moves onto it; the classic
`@orangecheck/design` is frozen (fixes only).

### Added: the family's chrome

- `./family` entry: every public site as data, no React. `FAMILY` (slug,
  label, href, group, one line, status, and for an app the protocols it
  shows), `PROTOCOLS` in the fixed order Attest · Lock · Vote · Stamp ·
  Agent · Pledge (each with `verb`, `pageHref` on ochk.io, `toolHref`,
  `specHref`, `kinds`), `FAMILY_GROUPS` (orangecheck, Protocols, Apps,
  Public goods), `familySite`, `protocolSite`, `familyByGroup`,
  `LEGAL_LINKS`, and `OCHK_IO_NAV` / `OCHK_IO_FOOTER` so ochk.io and its
  docs draw one header. Slugs match the classic system's.
- `FamilyMenu`: a chevron beside the lockup (the lockup stays a link home)
  opens every site in its group, one line each, a status only where a site
  is not live, the current site marked. On a desk it is three columns
  (orangecheck, Protocols, Apps with Public goods below), so the whole panel
  fits a 1280×800 screen without scrolling inside it.
- The docs link everywhere (registry, `OCHK_IO_NAV`) is ochk.io/docs, where
  the docs now live. The integrator demo is listed as "demo", so nobody takes
  Lumen Notes for an orangecheck product.
- `SiteHeader` takes `product` (the site's word beside the lockup),
  `family` (`true` or the site's slug), `search` (a slot before the
  actions), `variant: 'tool'` (56px, full width, a hairline under it) and
  `NavItem.children` (one dropdown level, each child with a `description`).
  On a phone the navigation and the family share one sheet.
- `SiteFooter` takes `family` (the registry's columns), `legal` (Privacy,
  Terms, Security, Trademarks, Contact on ochk.io, and the copyright line;
  the family column of ochk.io, ochk.app and docs is titled "Start here", as
  the lockup above it already says orangecheck)
  and `compact` (one row for tools). Any number of columns lays out without
  overrides: the lockup shares their row up to five.
- `SkipLink`, `SiteBanner` (one strip above the header in the three notice
  tones; each site keeps the rule that shows it) and `SignInFrame` (the
  split sign-in page: form column, ink art column from lg).
- `ErrorPage` (components): code, one sentence, a way on; a server error
  adds a retry. The check drawn in hairlines sits beside it on a wide screen.
- `StatusBadge` (primitives): Live, In testing, Not yet, Paused for a site;
  Good, Caution, Refused for a check. Fixed words, no free text.
- `TextLink` (components): router for this site's pages, a plain anchor for
  `/api/` and `/.well-known/`, a new tab (announced) for another site.
- `SectionHeading` (components): eyebrow, display title as an h2, one line.

### Added: public page blocks

Promoted from ochk.app, so ochk.io, the docs and vault draw the same pages:

- `FactBlock` (a titled block of facts with its sources beside the title),
  `FactRows` (one row per subject, each value under its label; stays
  readable on a phone), `EndpointList` (public endpoints and what each
  returns), `ProofStrip` (short claims between hairlines), `Closing` (the
  last band: one large line, actions, the check), and `LegalDocument`,
  which renders an `@orangecheck/legal` document as it is (the shape is
  written out, so this package does not depend on that one).
- `Home.stories.tsx` uses the package's `ProofStrip` and `Closing` instead
  of its own copies.

### Added: protocol page blocks

Every block takes a protocol's slug and reads the rest from the registry,
so the six protocol pages are one page with six sets of data:

- `ProtocolGrid` (the six as cards in the fixed order, verb, line, Nostr
  kinds; `link: 'page' | 'tool'`), `AppCard` / `AppGrid` (name, line, the
  protocols it shows, status; `group: 'app' | 'public-good'`).
- `ProtocolHero` ("Protocol · provenance", title, lead, actions, art),
  `ProtocolNav` (the six as links, the current one underlined), `SpecCard`
  (repository, version, licence, kinds, test vectors; `size="sm"` is one
  line), `VerifyBox` (paste an id, envelope or link; a plain GET form to
  the tool's verify page without script, or `onVerify`), and
  `ComparisonTable` (systems side by side in words, one column tinted;
  on a phone each property is a card with the tinted answer first).
- `VerifyReport`: a statement (Good, Caution, Refused) with a title and a
  line, each check with its result in words, the facts, and "What this did
  not check". One shape for every verb's verify view.
- `SignMessage`: the message in a code well with copy, the site's browser
  wallet buttons, and a pasted signature for any other wallet.

### Added: dialogs, paging, codes, questions

- `confirm()` and `prompt()` (primitives): ask and wait. `confirm` takes
  `title`, `message`, `confirmLabel`, `cancelLabel`, `destructive` and is
  true only on the confirm button; `prompt` adds `label`, `placeholder`,
  `defaultValue`, `hint`, `secret`, `minLength` and `validate` and is the
  text or null. Mount `<DialogHost />` once; asks queue and open one at a
  time. With no host nothing is asked and the answer is no.
- `Pagination` (primitives): `pageIndex` counts from 0 (the name says so;
  four family callers once passed 1-based state to the classic one), with
  `pageSize`, `total`, `onPage`; "11–20 of 54" and Previous / Next. One page
  shows nothing; an index out of range warns in development.
- `QrCode` (primitives): `value`, `size`, `label`. Ink on a white tile in
  both modes, drawn as one SVG path at render, so it is in the server's HTML.
  Adds `qrcode` as a dependency.
- `Accordion` / `AccordionItem` (primitives) on `<details>`: works before
  script, find-in-page opens the matching item, `single` keeps one open.
  `Faq` (components) is questions and answers on it.

### Accessibility

- The focus ring is the deep orange (`#EA580B`) in light mode. The brand
  orange it used was 2.81:1 on the canvas and 2.93:1 on a card, under the
  3:1 a focus indicator needs. Dark mode keeps `#F66D36` (6.17:1).
- A checked `Switch` fills with the deep orange in both modes, so the track
  that carries its state clears 3:1 on a card and the white thumb clears 3:1
  on the track.
- `Badge tone="brand"` (and so "In testing") tints at 9%, not 12%: measured
  as painted, the 12% tint put its orange text at 4.50:1 on a card, on the
  line. It is 4.66:1 now.
- `yarn test` checks both pairs, and a new `check-mirror` step fails when an
  `appColors` value drifts from `tokens.css`. It found one: dark `border` was
  `#262626` in the mirror and `#2A2A2A` in the CSS; the mirror now matches,
  and gains `ring`.

### Stories

- The package names no person: it is built from the ochk.app design
  (iteration 2). Crediting the designer waits for their consent.

- No personal names: sample accounts are `you@example.com`.
- The words people read are the canonical ones: Balance, Account, account
  id, ways to sign in, Waiting, release schedule. No visible `did:oc:`.

## [0.6.1] — 2026-10-17

- The site header stays legible over dark bands: it was 70% opaque, so a
  dark section scrolling under it turned it into a grey slab with grey text.
  It is 90% opaque now (95% without backdrop blur).

## [0.6.0] — 2026-10-17

- `AppShell` gives phones a tab bar when `nav` holds two to five pages, each
  with an icon: the pages sit under the thumb, fixed to the bottom, clear of
  the home indicator. The active tab is named to screen readers, and a badge
  shows as a dot. The page leaves room under its content, toasts rise above
  the bar, and the menu button and place strip go, since the tabs hold every
  page and the active one names it. A `footer` keeps the menu button, which
  opens the sheet without the pages. Tablets keep the sheet; `sections`, or
  more than five pages, keep today's frame everywhere.

## [0.5.11] — 2026-10-16

- `ErrorBoundary` (components): one broken part of a page shows a sentence
  with a retry and a reload instead of blanking the page. `resetKey` clears it
  on navigation; `onError` reports it.
- The header's home link is read as "orangecheck home", not "Home", so its
  name starts with the word it shows.
- A `ScrollFade` that hides content takes keyboard focus, so a table or code
  block that scrolls sideways can be scrolled without a mouse.
- `HalftoneSphere` with `alt=""` is hidden from screen readers instead of
  being an image with no name.

## [0.5.10] — 2026-10-16

- Running text (`p`, `li`, `dd`, `figcaption`, `blockquote`) wraps with
  `text-wrap: pretty` across the app, so a paragraph no longer ends on one
  stranded word. Set once in the theme instead of per page.

## [0.5.9] — 2026-10-16

- `Field` with an `action` puts the hint under the input, not under the row,
  so on a phone it no longer lands beneath the button.
- `AppShell` takes `page`, naming the page in the place strip when it is not a
  nav item of its own; a page reached by URL no longer shows the item that
  merely highlights for it.

## [0.5.8] — 2026-10-16

- `SplitBar` sets every segment's figure at one size. Two sizes (0.4.2) left
  the small share's figure about 3px lower than its neighbour's. The single
  size still fits a segment at its minimum width.

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

First release: the ochk.app design system, from the ochk.app design (iteration 2).

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
