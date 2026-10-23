# @orangecheck/app-design

The design system for **ochk.app**, built from the ochk.app design (iteration 2): Inter at
regular weight, a light canvas, one orange used sparingly, halftone photography and
the isometric check.

It is its own system. Every token and rule is scoped to `data-oc-app="ochk"`, so it
does nothing on a page without the attribute, and it never imports
`@orangecheck/design`. Stories: **design.ochk.io → ochk.app**.

```css
/* globals.css */
@import 'tailwindcss';
@custom-variant dark (&:is(.dark *));
@source '../../node_modules/@orangecheck/app-design/dist';
@import '@orangecheck/app-design/styles.css';
```

```tsx
// _document.tsx
<Html lang="en" data-oc-app="ochk">
```

```ts
// next.config.ts: required. Next must compile the package so its links share the
// app's router; left external, a link loses the base path and the build fails.
transpilePackages: ['@orangecheck/app-design'],
```

Light and dark come from plain `next-themes` (`attribute="class"`). Do not mount the
family `OcThemeProvider` on the same page: it writes `data-oc-theme` and the shared
`oc_skin` cookie.

| Entry | What |
|---|---|
| `/brand` | `Mark`, `AppIcon`, `Lockup`, `IsoCheck`, `HalftoneSphere` |
| `/primitives` | `Button`, `Badge`, `Card`, form controls (`Input size="sm"` for tools), `Dialog`, `Sheet`, `Popover`, `Tooltip`, `DropdownMenu`, `Tabs`, `Toaster`, `DensityProvider` |
| `/components` | `Display`, `Eyebrow`, `Section`, `StepGrid`, `PackageCard`, `TruthTable`, `Sats`, `DataTable`, `Notice`, `ProgressSteps`, `ErrorPage`, the public page blocks (`SectionHeading`, `FactBlock`, `ProofStrip`, `Closing`, `LegalDocument` …), the protocol page blocks (`ProtocolGrid`, `AppGrid`, `ProtocolHero`, `SpecCard`, `VerifyBox`, `ComparisonTable`, `VerifyReport`, `SignMessage`), code (`CodeBlock`, `CodeTabs`, `InstallTabs`), the docs blocks (`Breadcrumbs`, `DocsPager`, `OnThisPage`, `Callout`, `Steps`, `LinkCard`, `ApiTable`, `Diagram`, `SearchDialog`) and the tool parts (`ArtifactView`, `DropZone`, `FormSection`, `StateBadge`, `AnchorStatus`, `BlockHeight`, `BlockCountdown`, `Meter`, `FilterChips`, `ToolGrid`), and the parts signed-in pages repeat (`SectionTitle`, `ListCard`, `ListRow`, `ChoiceGroup`, `ChoiceCard`, `Avatar`) |
| `/chrome` | `SiteHeader`, `SiteFooter`, `FamilyMenu`, `SkipLink`, `SiteBanner`, `SignInFrame`, `AppShell`, `PaneHeader`, `AccountMenu`, `ThemeToggle`, `DocsShell`, `DocsNav`, `ToolShell`, `ToolColumn`, `SessionAccountView`, `AccountCta` |
| `/mdx` | `mdxComponents` and `createMdxComponents({ mermaid })`: markdown in the system's type |
| `/code` | `rehypeCode` (highlights fences at build time), `highlight`, `highlightToHtml`; no React |
| `/format` | `explorerUrl`, `shortenMiddle`, `formatBlockHeight`, `blocksToDuration`, `formatUtc`, `formatBytes`, `failureText`, `OFFLINE_TEXT`; no React |
| `/fonts` | `FontPreloads`, `FONT_FILES`: preload the fonts the first screen paints in, at the stylesheet's own address |
| `/og` | `OgCard`, `ogFonts()`, `OG_SIZE`: the family share card for next/og's ImageResponse, Inter inline |
| `/vitest` | `appDesignVitest()`: what a site's vitest config needs to render the package (next aliases, inlined); no React |
| `/acknowledgement` | `Acknowledgement`, the family's credit line, opt in; no other entry carries the name |
| `/session` | `SessionAccount`, read from `@orangecheck/auth-client` (an optional peer: install it to use this entry) |
| `/family` | every public site as data (`FAMILY`, `PROTOCOLS`, `OCHK_IO_NAV`, `LEGAL_LINKS`) and the account phrase (`GET_AN_ACCOUNT`, `SIGN_IN_LABEL`); no React |
| `/tokens` | the palette as data, for OG images and charts |

Docs written in MDX get highlighted code from the build and the system's type:

```ts
// next.config.ts
import { rehypeCode } from '@orangecheck/app-design/code';
const withMDX = createMDX({ options: { rehypePlugins: [rehypeCode] } });

// _app.tsx: <MDXProvider components={createMdxComponents({ mermaid: () => import('mermaid') })}>
```

Set a measure in `em`, not `ch`. A `ch` is the face's "0", and until Inter
arrives the fallback's "0" is 6% narrower at text sizes and 12% at display
sizes, so a box in `ch` changes width at the swap. Inter's "0", by optical size
(the font size in px, from 32 up the same):

| Size | 14 | 15 | 16 | 17 | 32+ |
|---|---|---|---|---|---|
| 1ch | 0.631em | 0.630em | 0.629em | 0.628em | 0.613em |

So 52ch at 14px is `32.8em`, 65ch (`max-w-prose`) at 15px `40.9em`, 20ch on
an `oca-display-*` heading `12.27em`. Headless Chrome on Linux rounds a "0" to
whole pixels at small sizes; measure one at a large size with the optical size
pinned rather than trust a 14px reading.

`yarn test` fails if any text token (the syntax colours included) drops under WCAG
AA in light or dark, if a rule could match without the attribute, if the
highlighter changes a character of the code it colours, or if a component stops
doing what its story shows. `scripts/halftone.py` turns any photo into
the dot layer of a `HalftoneSphere`.

MIT © OrangeCheck. Inter and JetBrains Mono are SIL OFL 1.1.
