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
| `/components` | `Display`, `Eyebrow`, `Section`, `StepGrid`, `PackageCard`, `TruthTable`, `Sats`, `DataTable`, `Notice`, `ProgressSteps`, `ErrorPage`, the public page blocks (`SectionHeading`, `FactBlock`, `ProofStrip`, `Closing`, `LegalDocument` …), the protocol page blocks (`ProtocolGrid`, `AppGrid`, `ProtocolHero`, `SpecCard`, `VerifyBox`, `ComparisonTable`, `VerifyReport`, `SignMessage`), code (`CodeBlock`, `CodeTabs`, `InstallTabs`), the docs blocks (`Breadcrumbs`, `DocsPager`, `OnThisPage`, `Callout`, `Steps`, `LinkCard`, `ApiTable`, `Diagram`, `SearchDialog`) and the tool parts (`ArtifactView`, `DropZone`, `FormSection`, `StateBadge`, `AnchorStatus`, `BlockHeight`, `BlockCountdown`, `Meter`, `FilterChips`, `ToolGrid`), and the parts signed-in pages repeat (`SectionTitle`, `ListCard`, `ChoiceGroup`, `ChoiceCard`) |
| `/chrome` | `SiteHeader`, `SiteFooter`, `FamilyMenu`, `SkipLink`, `SiteBanner`, `SignInFrame`, `AppShell`, `AccountMenu`, `ThemeToggle`, `DocsShell`, `DocsNav`, `ToolShell`, `ToolColumn`, `SessionAccountView`, `AccountCta` |
| `/mdx` | `mdxComponents` and `createMdxComponents({ mermaid })`: markdown in the system's type |
| `/code` | `rehypeCode` (highlights fences at build time), `highlight`, `highlightToHtml`; no React |
| `/format` | `explorerUrl`, `shortenMiddle`, `formatBlockHeight`, `blocksToDuration`, `formatUtc`, `formatBytes`; no React |
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

`yarn test` fails if any text token (the syntax colours included) drops under WCAG
AA in light or dark, if a rule could match without the attribute, if the
highlighter changes a character of the code it colours, or if a component stops
doing what its story shows. `scripts/halftone.py` turns any photo into
the dot layer of a `HalftoneSphere`.

MIT © OrangeCheck. Inter and JetBrains Mono are SIL OFL 1.1.
