# Changelog

## [Unreleased]

## [1.13.0] — 2026-10-21

The keyboard pass, a failure sentence, and two pages that sat busy doing nothing.

- A field in focus has a 2px edge in the ring colour: 3.56:1 on the light
  card, 6.17:1 on the dark. It was 2.35:1 in light. The look is keyed on
  `[data-oca-field]` (Input, Textarea, SelectTrigger carry it), so a field
  styled inline, like the sign-in ceremony's, can wear it too. An invalid
  field keeps its red edge in focus.
- On the orange closing band (`Section tone="brand"`) the focus ring is ink.
  It was orange on orange, 1.00:1 in dark.
- `SignInFrame` opens with "Skip to sign in", which lands on the ceremony.
- Every shell's `<main>` takes focus from "Skip to content" (`tabIndex={-1}`),
  and `SkipLink` gives a site's own plain `<main>` the same, with no ring
  drawn around the whole page.
- `DocsNav`: the open section's button closes it. It announced a collapsible
  section that never collapsed.
- A dialog or sheet opened without a Trigger (every `confirm()` and
  `prompt()`, one opened from state) hands focus back to what opened it. It
  fell to the page's body.
- Tab past a toast goes on to the page. sonner sent focus back to where it
  came from, so Tab looped through the toast. alt+T still returns there.
- A highlighted menu, select or search item has a 2px ring inside it, 3:1 or
  more against the menu. The tint alone was 1.10:1.
- A tab pressed with the mouse shows no ring; one reached by the keyboard
  still does. Radix focuses a tab from script on mousedown, which Chrome
  took for keyboard focus.
- `failureText(e, { source, fallback, keepMessage })` and `OFFLINE_TEXT` in
  `./format`: a failed request as one sentence a person can act on. No
  answer (every browser's words for it, a timeout, an abort) reads "mempool.space
  did not answer. Check your connection, then try again." with a source, or
  "We couldn't reach the server. …" without. Anything else is the fallback,
  "Something went wrong. Try again.", unless `keepMessage` keeps a sentence
  the site wrote. Library text, codes and status numbers never come through.
- `OgCard` takes `mark` (on by default). Off, the large mark is left out and
  the title takes the card's width, for a badge whose owner chose no mark.
- `Diagram` fetches mermaid only once the diagram is within a screen of
  view. About 180 kB, and most of the docs index's blocking time.
- The halftone portrait (`HalftoneCanvas`, `HalftoneSphere live`) draws its
  intro, then only while the pointer moves over it. Its breath is a CSS
  swell on the compositor; every dot used to be redrawn on every frame,
  ochk.app's biggest cost on the main thread. It still sleeps offscreen and
  in a hidden tab, and draws one still frame under reduced motion.
- `yarn test` gains three checks, each failing on 1.12.2: check-focus (real
  key presses in Chrome, light and dark), check-idle (draws counted while
  nothing happens; mermaid fetched only near view) and check-format. check-og
  covers `mark`.

## [1.12.2] — 2026-10-21

- `FontPreloads` named Inter without the `?dpl=` query Vercel's skew
  protection adds to every asset the stylesheet names, so the browser
  fetched the font twice and warned that the preload went unused (stamp.ochk.io
  and ochk.io, live). It now adds the query whenever Next defines the
  deployment. check-next builds with a `deploymentId` and fails unless the
  preload is the stylesheet's URL, query and all.

## [1.12.1] — 2026-10-21

- The registry's `toolHref` goes to a working page: stamp, attest, vote and
  pledge at `/create`, lock at `/app`, agent at `/app/compose`. Each tool
  site's root now 308s back to ochk.io/<verb>, so "stamp.ochk.io" on
  ochk.io/protocols opened the page its row already linked. New `docsHref`
  (ochk.io/docs/<verb>). `yarn test` asks each one on the live sites and
  fails on anything but a 200 with no redirect (`OCA_OFFLINE=1` skips it).
- `ToolShell` has a way to the protocol's docs: "Docs" in the header's line,
  and in the phone's menu when the tools are the tab bar, a 44px target.
- `DocsShell` with a build-time `toc` still marks the section being read.
  It stopped tracking when `toc` was given, which held back the docs'
  layout-shift fix.
- design.ochk.io's served page is titled "orangecheck design system", with a
  description, a canonical address and a share card, written into the built
  HTML rather than by script after load.

## [1.12.0] — 2026-10-20

Less JavaScript on every page, and text that paints sooner.

- The ESM build is split per module, with Radix and the small helpers
  (class-variance-authority, clsx, tailwind-merge) inside the package. Each
  entry was one module, so a site's `_app`, which imports a boundary and the
  toaster, carried every part any page used. Measured on stamp: shared
  first-load JS 252 → 172 kB gzip, `_app`'s chunk 354 → 99 kB, /signin 275 →
  188 kB, /404 267 → 214 kB. Because Radix ships inside, the 404 function
  Vercel runs, which carries only what `_app`, `_document` and the page
  trace, needs nothing from node_modules but the peers and sonner; stamp's
  error-page trace check passes with no site change. sonner stays the
  site's own copy, so `toast()` from sonner and app-design's `Toaster` are
  one toaster. CommonJS and the types are unchanged.
- `@orangecheck/app-design/fonts`: `<FontPreloads />` in `_document` preloads
  Inter (`mono` adds JetBrains Mono). Its address is the very file the
  stylesheet loads, hash and base path, so the browser fetches it once and
  the first text paints without waiting for the CSS to name it.
- `yarn test` builds a Next site to hold all three: `_app` with only a
  boundary and the toaster stays under 120 kB (78 kB now; 284 kB unsplit),
  the 404 page imports nothing its function does not ship (it failed on
  Radix when Radix stayed external), and the preload equals the
  stylesheet's font URL. The entries check now follows each entry through
  its chunks.

## [1.11.0] — 2026-10-20

Heading levels, from the second UI audit and pledge.

- Every titled part takes `as`, its heading level, so a page's outline
  runs h1, h2, h3 with no jump: `EmptyState`, `PlanCard`, `Panel`,
  `CardTitle`, `PackageCard`, `ProtocolGrid`, `AppCard` and `AppGrid`,
  `FactBlock`, `FactRows`, `Closing`, `SpecCard`, `VerifyBox` and `Step`.
  Each keeps its old level by default. A check renders each at a level it
  was asked for and reads it back, and fails if a part draws a fixed h2 to
  h6 again.
- `LockedPreview`'s title is a heading, h2 by default. A gate page made
  only of it had no heading at all (vault's eleven signed-out pages).
- `ListRow lines="all"`: the title and the line under it wrap in full (a
  query and its note), and the picture and the end stay level with the
  title. The row stays 44px at least. The default still cuts to one line.
- On a touch screen a small button (36px) and an icon button (40px) are
  44px targets too, as `icon-sm` became in 1.10.2: the header's "Get an
  account" was 36px on a phone.

## [1.10.2] — 2026-10-20

What the second UI audit measured on live pages.

- The family footer on a phone folds each link group into a disclosure: a
  native `<details>`, closed, its summary 44px, its links 44px, no script
  needed. The lockup sits once (the signature says the name), and the
  theme switch sits beside the OpenSats line. ochk.io's footer at 390 goes
  from 1,177px to 589px, a product's from 1,182px to 556px, with every link
  still there. A desk sees the columns exactly as before.
- On a touch screen a 32px icon button is a 44px target: `Button
  size="icon-sm"`, `CopyButton`, a Panel's "Open full screen" and the
  family menu's button. A pseudo-element draws the target, so the look and
  the spacing do not change; two buttons closer than 12px share the
  overlap.
- `GET_AN_ACCOUNT` goes to `https://ochk.app/signin`: making an account is
  signing in there. Its label is typed as the string it is, so no site
  casts it. `SessionAccountView` draws the account phrase signed out as
  primary, as `AccountCta` does; "Sign in" stays secondary, and
  `signInVariant` sets either.

## [1.10.1] — 2026-10-20

- `OgCard` shown in a page (its story on design.ochk.io) fell back to a
  serif: it named only `Inter`, which is what `ogFonts()` registers for
  next/og. It names the page's `OCA Inter` after it; next/og draws the same
  card, byte for byte.

## [1.10.0] — 2026-10-20

- `@orangecheck/app-design/og`: the family's share card for next/og.
  `OgCard` sets the lockup and the site's word, an eyebrow, the title at
  display size (three lines at most) and the host, in `ink` or `paper`, in
  tokens.css's colours, with the mark large at the lower right.
  `ogFonts()` gives Inter at 500 and 600, Latin and Latin Extended, carried
  inline so the route reads no file. The twelve family sites with an
  `/api/og` all draw the classic card today; the route stays the site's
  (or site-kit's), as the design spec splits it. `yarn test` renders the
  card through next/og in both tones.

## [1.9.0] — 2026-10-20

What sites kept local copies of.

- `@orangecheck/app-design/vitest`: `appDesignVitest()` returns the aliases
  for `next/link`, `next/router` and `next/compat/router` and inlines the
  package, so a site's tests render it. Merge it into the site's config.
  cosign, chat, vault and oc-www each wrote this by hand. Proved on cosign's
  suite: 276 of 276 pass with the preset; without it three files cannot
  load `next/link`. The package's own imports stay bare.
- `TabsContent keepMounted`: the panel stays mounted, hidden, while another
  shows. `TabsList wrap`: the tabs wrap onto a second row rather than
  scroll (globe's six layers at 390).
- `SheetContent` and `DialogContent` take `overlayClassName`, for a page
  with its own layers.
- `DataTable` rows open: `rowHref` makes each row one link, `onRowSelect`
  one button. The primary cell names it and its target covers the row; a
  control in another cell keeps its own press. The phone cards open too.
- `CopyButton onError`: the browser refused the clipboard. The button says
  "Could not copy" to a screen reader either way.
- `ComparisonTable`: a column's `action` adds a last row with a way in under
  each column. `Closing` takes `fineprint`.
- `AppShell product`: the app's word beside the lockup, as SiteHeader and
  SignInFrame have it.
- `selfHostedLegalLinks({ contact: false })`: a product without one of the
  pages links ochk.io's, so the legal row keeps its five links.
- `HashChip` at compact density sits in a line of text: 13px type and a
  24px copy button whose target is still 44px. The line is under 32px.
- `ErrorPage` and `SignInFrame` say when to pass `home="/"`: an app on its
  own host whose `/` is its home.
- `@orangecheck/app-design/acknowledgement`: the family's credit line, opt
  in. It lives in its own entry, and a check fails if any other entry
  carries the name, so a site that never imports it (ochk.app) ships it
  nowhere. Pass it to Closing's `fineprint`.
- `MdxTable` on a phone: 10px cell padding, and inline code also breaks
  after an opening bracket. After 1.8.1 the docs' tables that still scroll
  at 390 are 29 of 1,178, each wider than the screen word for word.
- `DropZone` already takes `privacy` (`null` leaves the line out).

## [1.8.1] — 2026-10-20

Defects sites measured on live pages.

- `MdxTable` no longer gives every cell a 9rem minimum on a phone. A
  three-column table needed 432px and was cut mid-word in a 355px box: 89
  tables on 56 docs pages. Cells wrap at word boundaries, and inline code in
  a cell breaks after its punctuation (`oc_session_expired` at an
  underscore), never mid-word. A table scrolls, with the fade, only when its
  words cannot fit. Headers wrap on a phone too.
- A bare `border`, `border-b` or `divide-y` draws in the hairline token.
  Tailwind 4 draws it in currentColor, so every one ported from v3 turned
  into a black line in light mode and a white one in dark. A colour utility
  still wins.
- `BlockCountdown` links a height to mempool.space only once it is mined.
  A height ahead of the tip linked to a page that does not exist.

## [1.8.0] — 2026-10-20

What chat's and cosign's re-chromes still drew by hand.

- `ListRow`: one row of a list, the classic DataRow's place. A picture, a
  title with a time or count at its right, a line under it, something at
  the end. With `href` or `onSelect` the whole row is one link or button,
  and `actions` sits beside it, never inside it. `variant="pane"` is a
  rounded row for a thread or contact list, lifted when `current`;
  `revealActions="hover"` shows the actions on hover from md, always on a
  phone. A row is 44px tall at least.
- `Avatar`: a person, round. Their picture when there is one, falling back
  to their initials if it fails to load; else the initials on a tint picked
  from the seed, so a contact keeps one colour everywhere; else a person
  glyph. Sizes match Monogram's. `yarn test` holds the initials to AA at
  every hue, light and dark.
- `PaneHeader` in `./chrome`: a pane's 56px bar in an app frame, the same
  gutter and hairline on every pane.
- `Notice` takes an `icon`, in place of the dot, in the notice's colour.
- A menu's items are 44px tall on a phone. An action list on a row is a
  `DropdownMenu`: it gives the arrow keys, Escape and focus back to the
  button, which a popover of buttons does not.

## [1.7.0] — 2026-10-20

What the family UI audit and cosign's, vault's and chat's re-chromes found.

- `ToolShell` owns the column. Every tool page's title starts at one x:
  144px at 1440, 16px at 390. `measure="narrow"` keeps a form or a result
  to 48rem from that same left edge; a page no longer centres its own
  narrower box. `ToolColumn` is the same column for an app page that
  scrolls itself. The compact footer lines up with it too. Before, the six
  tool sites' titles started at 144, 176, 272 and 335px under one header.
- `ErrorPage` inside `ToolShell` or `AppShell` sits on the shell's gutter.
  It drew a second one: 33px in at 390.
- On a phone the small controls are 44px targets: the compact footer's
  lockup (its look unchanged), an artifact's Download and Copy, its
  Formatted / Raw switch, every code block's Copy, and `FilterChips`.
  `FilterChips` also takes number values.
- `GET_AN_ACCOUNT` in `./family` is the one account phrase: "Get an
  account", linking ochk.app. `AccountCta` draws it in a header. ochk.io and
  the docs show it; ochk.app shows it signed out, pointed at its own
  sign-in. A tool site keeps "Sign in" (`SIGN_IN_LABEL`).
- `SignInFrame` takes `product`, the site's word beside the lockup, as the
  header has it. It defaults to the protocol's word, so a tool site's
  sign-in reads "orangecheck | stamp".
- `SectionTitle`: a block's title on a signed-in page, with a count after
  it, a line under it and an action at the right. `ListCard`: rows in one
  card, a hairline between each. `ChoiceGroup` and `ChoiceCard`: one choice
  from a few cards, a radio group underneath, `sm` for rows in a dialog.
  cosign, vault and chat each drew these by hand, 20 to 37 times.
- `Monogram` sizes `xs` (32px) and `2xs` (28px), for a list row and a
  facepile.
- `SiteFooter` keys its links by place and label. Two links to one address
  clashed.
- `styles/swagger.css`: on a phone the collapse arrows, the operation lock
  and the models toggle are 44px targets. The lock takes the muted ink:
  open, it was 40% black, 2.8:1 on a tinted row in light and 1.1:1 in dark.
  A parameter's place ("path") and "required" take the system's inks too.
  `scripts/check-swagger.mjs` checks every one of these.
- `--oc-signin-text-size`, `-hint-size`, `-label-size`, `-button-size`: the
  sign-in ceremony in the system's body, hint, label and button sizes
  (auth-client ≥ 2.33.4).

## [1.6.2] — 2026-10-20

What btc's and agent's moves found.

- `Panel`: the actions stay top right beside a description of two lines or
  more. The text now takes the room the actions leave, and wraps under them
  only below 12rem. Before, a long line pushed the expand button onto a row
  of its own, at the left: most half-width panels at 1440, nearly all at 390.
- `Panel`, expanded: the body scrolls inside itself, so a tall body no longer
  runs under the source at the foot. At 390×844 a chart panel's "Source:"
  line drew over its stat cards.
- `ToolShell variant="app"` and `AppShell variant="rail"` contain what is
  positioned inside them (`relative`, `overflow-clip`). Absolutely positioned
  text deep in a page's own scroller, such as FormSection's "Step N:" or
  TextLink's "(opens in a new tab)", took the document as its frame and
  stretched it past the window: 1936px against 900 on agent's compose page.
  `overflow-clip` clips like `hidden` but is not a scroller, so a focus deep
  in the page cannot shift the frame.
- `ScrollFade`'s scroller is positioned too. The same text in the last
  column of a wide table widened a phone's page to the table's width.
- `scripts/check-layout.mjs` measures all four in Chrome at 390 and 1440.
  It compiles the CSS with Tailwind, as a site does, and opens a Panel in
  the browser. CI uses the runner's Chrome; locally it uses Playwright's.

## [1.6.1] — 2026-10-20

- `SignMessage` hides `OcWalletButton`'s own heading in its wallets slot
  (`--oc-wallet-heading: none`, read by wallet-adapter ≥ 0.6.4). Its lead
  already says what to do, so the heading was a second label in another
  style. Elsewhere `--oc-wallet-heading` is `block`. A story shows both,
  with the real OcWalletButton.

## [1.6.0] — 2026-10-20

What globe and btc need: figures, their charts, and where each number comes
from. A chart library is still not part of the system; btc keeps its own
LineChart and draws it in these tokens and classes.

- Chart tokens: `--oca-chart-1` to `-4` and `-neutral`, orange first, plus
  `-up`, `-down` (the status colours) and `-grid`. Each series clears 3:1 on
  the card and the page in both modes, and `yarn test` checks them as a set:
  every pair stays apart in normal vision and as deuteranopia and protanopia
  see them. Tailwind names them `oca-chart-*`, and `chartColor(i)` gives the
  CSS colour for series i.
- `ChartFrame` with a legend in the series' colours (dashed for a dashed
  line) and a caption. Inside it a hand-drawn SVG takes the chrome by class:
  `oca-chart-tick`, `-grid`, `-axis`, `-zero`, `-crosshair`, `-marker`, and
  `oca-chart-tooltip` for the hover card.
- `Sparkline`: a named picture of a trend, stretching to its box. `tone`
  takes ink, muted, a series, or `trend` (up or down by its first and last
  values).
- `Panel`: title, line, actions, body, and a source at its foot.
  `expandable` opens the body over the full window, and Escape closes it.
  Pass `children` as a function to draw it bigger there.
- `SourceNote`: "where this number comes from", with the source named and
  linked, how it is read, and when. It is a Source button with a popover,
  or `variant="line"`, one line of fine print for a canvas in full screen or
  a footer.
- `HudCard`: a translucent card over a canvas, with an eyebrow, a live dot,
  a headline figure, rows and a footnote. Its text clears 4.5:1 over any
  scene, and the contrast check works that out for the worst one.
- `KeyValueList` items take `note` (a verdict) and `tone` (good, caution,
  bad, brand, muted).
- `StatCard delta`: the change beside the figure, signed, with an arrow. It
  is green when it moves the good way (`good: 'up' | 'down'`), red when it
  moves the other way, and quiet at zero.
- `appColors` (./tokens) now has every colour token in both modes, the chart
  series included, generated from tokens.css into `palette.ts` at build. It
  is also exported as `lightPalette` and `darkPalette`. Values are
  lowercase. check-mirror fails if the file falls behind tokens.css.

## [1.5.0] — 2026-10-20

What vault, chat and cosign need to move onto the system. The public goods'
parts (globe, btc) follow in 1.6.

- `AppShell variant="rail"`: a messenger's frame. It takes the whole window,
  with `header` above, an icon rail from md (each page's name in a tooltip,
  `persistent` pages and `account` at its foot), the content full-bleed and
  managing its own panes, and the tab bar on a phone.
- Nav badges: a number shows as a count (99+) on the rail and the tab bar,
  anything else as a dot, and both are read with the page's name. The dot is
  the deep orange, which clears 3:1 on the background; the old one did not
  in light mode.
- Tab bar: past five pages, four tabs and More, a sheet with the rest. Six
  pages with icons used to fall back to the drawer.
- `ShellSection icon`: with one on every section, a phone's tabs are the
  sections, and each section's pages stay in the menu.
- `CommandDialog`: a command palette on SearchDialog's machinery. Its list
  is open before anything is typed (`onQuery('')` gives recents and
  actions). A result with `run` is an action, and one with `href` is a place.
  Search results take an `icon` and a `meta` word too.
- `prompt({ confirmField })` asks twice, for a passphrase, and refuses until
  the two match.
- `CountdownRing`: the seconds left in a cycle as an emptying ring, red at
  the end. Given only `period` it follows the clock in windows aligned to
  the epoch, as a TOTP code does. It is read as a timer.
- `PlanCard`: a plan's name, line, price and period, footnote, features,
  badge ("Your plan", "Recommended") and button. `highlight` marks the one
  the page argues for. Compare plans in a `ComparisonTable`.
- `LockedPreview`: a real sample of what a sign-in or a plan opens, faded
  and out of reach of the pointer, keyboard and screen reader (`inert`),
  with the way in over its foot.
- `Meter tone`: `good`, `caution` and `bad` for a reading with a verdict,
  such as a password's strength. Each fill clears 3:1 on the track, and
  `yarn test` checks it.
- `scripts/check-dom.mjs` also runs the palette, the twice-asked prompt and
  the countdown.

Already in the package and ready for these apps: `confirm`, `Pagination`
(0-based), `QrCode`, `CopyButton clearAfter`, `Meter` with a ghost,
`BlockCountdown`, `ComparisonTable`, `Sats`, `StatusDot`, `Tooltip`,
`Monogram`, `FilterChips`, `Field`.

## [1.4.1] — 2026-10-20

What the tool sites found moving onto the shell.

- `ErrorPage` and `SignInFrame` no longer send "home" to `/`, which every tool
  site now redirects off-site. Inside a `ToolShell` an ErrorPage goes to the
  protocol's page on ochk.io; elsewhere either takes `protocol`, and with
  neither, home is ochk.io. `home` still overrides.
- `Toaster` reads next-themes, so toasts are dark in dark mode with nothing
  passed. A toast is now the popover in both modes: sonner's own white and
  black outranked the classes.
- `SignMessage`: the message wraps instead of running off a phone (a
  64-character id is one word). Copy gives its exact bytes, a final newline
  included, as 1.4.0's `CodeBlock` does. `scheme="legacy"` makes the hint
  say "legacy, BIP-137" instead of "BIP-322". `CodeBlock wrap` is the same
  for any block.
- `FormSection`: on a phone the `action` takes its own row under the hint,
  rather than squeezing the hint into a narrow column.
- `FilterChips` wrap onto a second row instead of scrolling sideways.
- `scripts/check-dom.mjs` clicks in jsdom: a copy of a message or a fence
  ending in a newline is compared byte for byte, and the Toaster is checked
  in both modes.

## [1.4.0] — 2026-10-20

What ochk.io/docs and ochk.io built locally, so both can drop the workarounds and
the classic `@orangecheck/design`.

- `styles/swagger.css`: Swagger UI in this system's dark mode, with 16px fields on
  a phone and method badges that clear AA. Opt-in, imported after
  `swagger-ui.css`. Links take the accent ink.
- `ApiTable`: a row takes an `id`, and a link to `#id` lands on that row and
  tints it. One set of rows now serves the desk and the phone, so the id is a
  single anchor. A row's `source` (a link to the line) sits in a "Defined in"
  column named once in the header, not on every row. A column no row fills,
  Description included, is left out.
- `TextLink`, and so markdown's `a`: a relative href (`../README`, `VerifyOk`)
  resolves against the page and goes through the router, which keeps the base
  path.
- The MDX map: `h5` and `h6` (TypeDoc's "Returns"), and GitHub task lists: the
  box replaces the bullet, a wrapped task starts under its text, and the box is
  named "Done" or "To do".
- `SpecCard repo="oc-chat-protocol" kind="security"`: one file in any spec repo,
  named as the normative copy of the page, with the kind's sentence (`spec`,
  `security`, `rationale`) or your own `note`. `SpecCard protocol` is unchanged.
- `ProtocolGrid link="docs"` inside `DocsShell` links `/attest` through the
  router instead of reloading at ochk.io/docs/attest. Outside the docs it still
  links ochk.io/docs.
- `DocsShell navCurrent`: the nav item to mark and open, apart from the page, so
  a deep SDK page opens its package. Its default footer is now `OchkIoFooter`.
- `CodeBlock` copies the code byte for byte, its final newline included, so a
  hash printed beside a block matches a copy of it. `rehypeCode` marks a fence
  that ends in a newline (`data-eol`), and the MDX map passes it on as
  `trailingNewline`. A shell transcript still copies its commands only.
- `OchkIoFooter`: ochk.io's footer as one export, with its column, the family,
  the fine print, the OpenSats line, the theme switch and the legal row. Pass
  `columns` to write ochk.io's own links relative.
- `Diagram`: a diagram up to a third wider than the column scales to fit, its
  14px labels staying at 10.5px or more. A wider one keeps its size and
  scrolls.
- `AppShell family`: the family menu beside the lockup, in the sidebar and the
  phone's bar, as `SiteHeader family` has it.
- `--oc-wallet-message-font` (mono): wallet-adapter 0.6.3 sets the message to
  sign and the pasted signature in it, so exact strings stay mono under sans
  labels.

## [1.3.0] — 2026-10-20

What stamp built locally on the tool shell, so the other five tool sites do not
each copy it.

- `ToolShell`: the lockup and the protocol's word go to the protocol's page on
  ochk.io (`https://ochk.io/stamp`), not `/`, which every tool site now
  redirects off-site. `home` still overrides it.
- Sign-in in place. `SessionAccount signInPath="/signin"` (and
  `SessionAccountView`) links the site's own sign-in page with `return_to` set
  to the page the viewer is on: its path and query, never the fragment, so a
  share link's secret stays in the browser. The server renders the route with
  any base path, so hydration matches; a dynamic route renders the bare page
  until the browser reads the address. A path the URL parser would read as
  another host (`//evil.example`) returns to `/`. `useSignInHref(path)` builds
  the same link for a site with its own session source. `signInHref` still wins
  when both are given.
- `VerifyReport`: a Bitcoin address in the title or summary wraps on a phone
  instead of running off the card. The header sizes each line to its longest
  word, and an address is one long word. `check-render` renders one.
- `VerifyReport`: a check can be `none`, read "None" beside a slashed circle,
  for something that is legitimately absent: no timestamp yet, no stake bound.
  "Not checked" stays for a check that did not look. It uses the muted colours
  the report already does, so it adds no contrast pair.
- `Field` takes a function as its child, given the id, `aria-describedby` and
  `aria-invalid`, so the control can sit in a box of its own: an input with a
  suggestion popover anchored under it, not under the hint. `id` sets the
  control's id.

Released beside it: `@orangecheck/wallet-adapter` 0.6.1 no longer lists Alby.
WebLN signs with a Lightning node key, so no Alby signature verifies for a
Bitcoin address, and the picker offered a choice that could only fail. A
`wallets` row you build for `SignMessage` from `detectWallets()` loses it too.

## [1.2.3] — 2026-10-20

Reverts 1.2.2's import. `next/link.js` is a specifier Next's aliases do not know, so
Next left it external at server render, where it loaded a second copy of the router
context. Links rendered without the router: on a site with a `basePath` every link
lost it (the docs at ochk.io/docs linked to `/attest`, not `/docs/attest`). The
package imports `next/link` again, and a site **must** list it in `transpilePackages`,
as every family site did before 1.2.2. `scripts/check-next.mjs` replaces the old
check: it builds a pages-router site with a basePath and fails unless a router link
in the server's HTML carries it. Run against 1.2.2's import it fails with
`href="/x"`.

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
