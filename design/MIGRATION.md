# Migrating a consumer site to `@orangecheck/design`

A mechanical, low-risk recipe. For the default `orangecheck` skin the result is a
**pixel no-op** — tokens, the utility layer, and shadows are byte-for-byte what
the site ships today. Do one site per PR; verify on the Vercel preview before
merging. `oc-stamp-web` is the canonical pilot (its primitives are the ones the
package was extracted from, so its diff is import-path-only).

## 1. Add the dependency

```jsonc
// package.json
"@orangecheck/design": "^0.1.0"
```

`@orangecheck/ui`, the Radix packages, `cva`, `clsx`, `tailwind-merge`, and
`sonner` arrive transitively — you may drop them as *direct* deps once nothing
local imports them, or leave them (versions match, no conflict).

## 2. globals.css — replace the inlined tokens with one import

Delete the site's `@theme inline { … }` block and its `:root { … }` / `.dark { … }`
token blocks **and** the duplicated utility layer (`.container`, `.font-display`,
`.label-mono`, `.terminal*`, `.bg-grid/.bg-dots`, `.docs-prose`, `.oc-working*`,
`.skip-link`, brand utils). Replace with:

```css
@import 'tailwindcss';
@source '../../node_modules/@orangecheck/ui';
@source '../../node_modules/@orangecheck/design'; /* emit utilities used inside the package */
@import 'tw-animate-css';
@custom-variant dark (&:is(.dark *));

@import '@orangecheck/design/styles.css'; /* tokens + bridge + utilities + all skins */
```

Keep the site's `next/font` setup that defines `--font-sans-display` /
`--font-mono-display` — the default skin defers to them, so type is unchanged.
Keep any genuinely site-specific CSS (e.g. a bespoke hero treatment).

## 3. Providers — `_app.tsx`

```tsx
import { OcThemeProvider, OcThemeBridge } from '@orangecheck/design';

<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <OcThemeBridge />          {/* mode (light/dark) cross-subdomain sync — replaces the local ThemeBridge */}
    <OcThemeProvider>          {/* skin axis + oc_skin cross-subdomain sync */}
        {/* …existing app… */}
    </OcThemeProvider>
</ThemeProvider>
```

Delete the site's local `ThemeBridge.tsx` (now `OcThemeBridge`).

## 4. FOUC guard — `_document.tsx` `<Head>`

```tsx
import { getOcThemeInitScript } from '@orangecheck/design';
<script dangerouslySetInnerHTML={{ __html: getOcThemeInitScript() }} />
```

## 5. Swap primitive imports

Repoint local `@/components/ui/*` imports to the package. These are import-path
changes only (the components are byte-identical to the canonical source):

```diff
- import { Button } from '@/components/ui/Button';
- import { Badge } from '@/components/ui/Badge';
+ import { Button, Badge } from '@orangecheck/design';
```

Then delete the now-unused local `src/components/ui/*` files (and `confirm`/`prompt`
hosts, `cn`, etc., repointing to the package). Leave site-specific components
(landing sections, feature components, `LogoMark`, `Seo`) in place — the header
composition stays per-site (see the `Patterns/App Chrome` story for the canonical
shape).

## 6. The theme picker (gated)

Mount next to the existing `ThemeToggle` in the header, behind a flag so it ships
dormant to prod first:

```tsx
import { OcThemePicker } from '@orangecheck/design';
{process.env.NEXT_PUBLIC_OC_THEME_PICKER === '1' && <OcThemePicker />}
```

## 7. Verify before merging

- `yarn type-check && yarn build` locally.
- Open the PR → check the **Vercel preview** renders identically to production
  for the default skin (the design system ships `scripts/verify-stories.mjs` /
  `verify-themes.mjs` as patterns you can point at a preview URL).
- Confirm light/dark still works and (with the flag on) the skin picker recolors
  the whole site and persists across `*.ochk.io`.
- Only merge once the preview is confirmed a no-op for the default skin.

## What must NOT change for the default skin

Colors, radius (0.25rem), fonts, and **shadows** are byte-for-byte identical to
today. If anything looks different on the default skin, stop — that's a bug in
the migration, not an intended change.
