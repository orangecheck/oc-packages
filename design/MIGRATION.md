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

### 1a. next.config — transpilePackages (REQUIRED)

Add `@orangecheck/design` to `transpilePackages`:

```ts
transpilePackages: [/* …existing… */, '@orangecheck/ui', '@orangecheck/design'],
```

This is **not optional**. `@orangecheck/design` re-exports `@orangecheck/ui`,
whose ESM uses a bare `next/link` import. If `design` isn't transpiled, Next
externalizes it and SSR page-data collection fails with
`Cannot find module 'next/link'`. Transpiling lets webpack resolve it. (Keep
`@orangecheck/ui` in the list too if it's already there.)

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

## 8. Live BTC/USD spot rate · `useSpotPrice` (0.7.6+)

`@orangecheck/design/format` ships a React hook for live BTC/USD display
alongside the existing `satsToUsd` / `formatSats` formatters. Used today by
`vault.ochk.io/pricing` (USD line under each sats price) and `me.ochk.io`
treasury surfaces.

```tsx
import { asOf, satsToUsd, useSpotPrice } from '@orangecheck/design';

function PriceCard({ sats }: { sats: number }) {
  const { btcUsd, fetchedAt } = useSpotPrice();
  return (
    <>
      <div>{sats.toLocaleString()} sats</div>
      <div className="text-muted-foreground/70">≈ {satsToUsd(sats, btcUsd)}</div>
      {fetchedAt && (
        <div className="text-muted-foreground/60 text-[10px]">
          {asOf(fetchedAt)} · live via mempool.space
        </div>
      )}
    </>
  );
}
```

**Consumer contract.** The hook makes a relative `fetch('/api/price/btc-usd')`.
Every consumer that mounts it MUST host that route locally — a small Next.js
API route that proxies mempool.space's `/api/v1/prices` and caches the rate
in-process for 60s. Reference implementation:

- `oc-vault-web/src/pages/api/price/btc-usd.ts` (the endpoint)
- `oc-vault-web/src/lib/price/feed.ts` (the server-side fetch + 60s cache)

Both files are Node-only and stay **per-consumer** — they don't belong in the
UI package. To consume cross-origin (e.g. point a fresh consumer at a sibling
site's endpoint while it's being scaffolded), pass `endpoint` explicitly:

```tsx
const { btcUsd } = useSpotPrice({
  endpoint: 'https://vault.ochk.io/api/price/btc-usd',
});
```

The endpoint route already sets `Access-Control-Allow-Origin: *` for that
reason.

### Migrating from a local copy

If your site has a local `lib/price/usePrice.ts` (me.ochk's pre-0.7.6 shape) or
`lib/price/format.ts` (vault.ochk's pre-0.7.6 shape), delete those files and
import from the package instead:

```diff
- import { usePrice } from '@/lib/price/usePrice';
- import { satsToUsd } from '@/lib/price/format';
+ import { satsToUsd, useSpotPrice } from '@orangecheck/design';
```

`useSpotPrice` returns the richer `{ btcUsd, fetchedAt }` shape rather than a
bare number; callers that don't need the timestamp destructure: `const { btcUsd } =
useSpotPrice()`.
