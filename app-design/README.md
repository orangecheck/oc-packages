# @orangecheck/app-design

The design system for **ochk.app**, built from Souheila's partner deck: Inter at
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

Light and dark come from plain `next-themes` (`attribute="class"`). Do not mount the
family `OcThemeProvider` on the same page: it writes `data-oc-theme` and the shared
`oc_skin` cookie.

| Entry | What |
|---|---|
| `/brand` | `Mark`, `AppIcon`, `Lockup`, `IsoCheck`, `HalftoneSphere` |
| `/primitives` | `Button`, `Badge`, `Card`, form controls, `Dialog`, `Sheet`, `Popover`, `Tooltip`, `DropdownMenu`, `Tabs`, `Toaster` |
| `/components` | `Display`, `Eyebrow`, `Section`, `StepGrid`, `PackageCard`, `TruthTable`, `Sats`, `DataTable`, `Notice`, `ProgressSteps` … |
| `/chrome` | `SiteHeader`, `SiteFooter`, `AppShell`, `AccountMenu`, `ThemeToggle` |
| `/tokens` | the palette as data, for OG images and charts |

`yarn test` fails if any text token drops under WCAG AA in light or dark, or if a
rule could match without the attribute. `scripts/halftone.py` turns any photo into
the dot layer of a `HalftoneSphere`.

MIT © OrangeCheck. Inter and JetBrains Mono are SIL OFL 1.1.
