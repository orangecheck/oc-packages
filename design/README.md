# @orangecheck/design

The OrangeCheck design system — **multi-theme tokens, primitives, and family
composites** for the `.ochk.io` sub-sites. Tailwind 4 + Next.js Pages Router.
Family-internal (for embeddable OrangeCheck components see `@orangecheck/react`).

Living showcase: **[design.ochk.io](https://design.ochk.io)** (Storybook).
Canonical design + rollout plan: `~/Projects/ochk/DESIGN-SYSTEM-PLAN.md`.

## What's in the box

| Subpath | Contents |
|---------|----------|
| `@orangecheck/design` | everything below, re-exported |
| `@orangecheck/design/tokens` | `OcThemeProvider`, `useOcSkin`, `OcThemePicker`, `getOcThemeInitScript`, `OC_THEMES`, `DEFAULT_OC_THEME`, `cn` |
| `@orangecheck/design/primitives` | `Button` `Badge` `Input` `Label` `Alert` `Textarea` `ThemeToggle` `Working` `ErrorBoundary` (cva + Radix) |
| `@orangecheck/design/components` | family composites, re-exported from `@orangecheck/ui` |
| `@orangecheck/design/styles.css` | token bridge + base layer + utility system + all skin token values |

## Two theme axes

- **Mode** — `light | dark`, owned by `next-themes` via the `.dark` class. Toggle
  with `<ThemeToggle />`. Unchanged from today.
- **Skin** — a named theme (`orangecheck` default, `midnight`, …), owned by
  `<OcThemeProvider>` via the `data-oc-theme` attribute, persisted in the
  `oc_skin` cookie at `Domain=.ochk.io` so a choice carries across every family
  site. Pick with `<OcThemePicker />`.

The two compose: any skin renders in both modes.

## Adoption (consumer site)

`src/styles/globals.css`:

```css
@import 'tailwindcss';
@source '../../node_modules/@orangecheck/ui';
@source '../../node_modules/@orangecheck/design';
@import 'tw-animate-css';
@custom-variant dark (&:is(.dark *));
@import '@orangecheck/design/styles.css';
```

`_app.tsx`:

```tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <OcThemeProvider>
        {/* …app… */}
    </OcThemeProvider>
</ThemeProvider>
```

`_document.tsx` `<Head>` (avoids a skin flash before hydration):

```tsx
<script dangerouslySetInnerHTML={{ __html: getOcThemeInitScript() }} />
```

Header (gate the picker behind a flag during staged rollout):

```tsx
<ThemeToggle />
{process.env.NEXT_PUBLIC_OC_THEME_PICKER === '1' && <OcThemePicker />}
```

Fonts are still loaded by the app via `next/font` into `--font-sans-display`
and `--font-mono-display`, exactly as before.

## Adding a skin

1. Add `src/styles/themes/<id>.css` declaring the full token set for both modes
   (under `[data-oc-theme='<id>']` and `[data-oc-theme='<id>'].dark`).
2. `@import` it from `src/styles/themes.css`.
3. Add a row to `OC_THEMES` in `src/tokens/themes.ts`.
4. Publish. Every site picks it up on the next Renovate bump — no per-site edits.

## Build

```
yarn build          # tsup (cjs+esm+dts) + copy CSS to dist/styles
yarn type-check
yarn storybook      # local showcase
yarn build-storybook
```

Published via tag `design-v<x.y.z>` from `oc-packages` (see `release.yml`).
MIT.
