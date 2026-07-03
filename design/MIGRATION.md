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

## 0.26.0 — aurora depth, release 1 (motion governance + texture)

Nothing is required of consumers — every addition arrives through the normal
bump and is either automatic or opt-in:

- **Ambient-motion pause (WCAG 2.2.2).** `OcAppearanceMenu` gains an
  "ambient motion" row persisted in the `oc_motion` cookie at `Domain=.ochk.io`
  and applied pre-paint by `getOcThemeInitScript` as `data-oc-motion="off"` on
  `<html>`. The aurora pauses automatically. Any site-local decorative
  animation should add the `.oc-ambient` class to inherit the pause — sweep
  your hand-rolled hero animations (e.g. cosign's) when convenient.
  `useOcMotion()` exposes the switch programmatically.
- **Grain.** The aurora now carries a 160px luminance-only noise tile
  (`--oc-grain-op`, default 0.1, ~1.3× in dark). Zero it per-site with
  `.oc-aurora { --oc-grain-op: 0 }`.
- **`.oc-guides`** — opt-in quieter lattice with plus-mark crosses; the
  2026-register evolution of `.bg-grid` (which is untouched).
- **`.oc-halo`** — the glyph-shaped token-tinted glow plate for hero artifact
  cards; replaces hand-rolled `bg-primary/10 -inset-6 blur-3xl` divs. Override
  the mark with `--oc-halo-mask`; dial with `--oc-halo-op` / `--oc-halo-blur` /
  `--oc-halo-color`. Soft bloom under ember, tight edge-glow under the
  cypherpunk skins. Decoration never replaces a hero's proof column.

## 0.27.0 — aurora depth, release 2 (OcAuroraGL, default OFF)

The WebGL2 silk-field upgrade of the aurora. **No consumer action required and
nothing changes visually by default** — `gl` is opt-in:

```tsx
<OcThemeProvider aurora={{ gl: true }}>            // pilot opt-in
<OcThemeProvider aurora={{ intensity: 0.6, gl: true }}>
```

- Silk finish under ember; device-pixel 8×8 Bayer "proof texture" under the
  four cypherpunk skins. Palette crossfades in OKLab (~250 ms, synced with the
  token snap). Renders inside `.oc-aurora`, so the radial mask, the
  mode-op × intensity opacity, and ember's `--au-*` re-hue govern it for free.
- Degradation ladder (every rung lands on today's CSS blobs, silently): SSR /
  no-JS → prefers-reduced-motion (live listener) → `oc_motion` off →
  forced-colors → saveData / deviceMemory≤4 → WebGL2 probe with
  `failIfMajorPerformanceCaveat` → runtime jank governor (7-day localStorage
  kill flag) → context loss. When GL is live the blobs pause AND hide — the
  page pays for exactly one aurora.
- Settle-to-static: the field freezes after ~90 s without input and eases back
  on interaction (battery).
- Per-site kill switch, no package release needed: `.oc-aurora { --oc-aurora-gl: off }`.
- Cost honesty: the scene code (~2.5 KB gz) rides the tokens chunk (tsup
  inlines the dynamic import); it never *executes* unless `gl` is set and
  every gate passes. A webpack-owned split is a candidate refinement.
- New shared rail for future GPU components: `readOcSceneTokens` /
  `subscribeOcTheme` / `normalizeHue` from `@orangecheck/design/tokens`.

## 0.28.0 — aurora depth, release 3 (OcSigil, ships DORMANT)

`OcSigil` — the brand mark as a deep-set corner-bleed emboss — is published but
mounted NOWHERE by default. Activation is a per-site art decision:

```tsx
// inside the hero <section class="relative overflow-hidden …">
<OcSigil glyph="stamp" corner="bottom-left"
         className="h-[min(56vmin,540px)] w-[min(56vmin,540px)]" />
```

Rules (the placement doctrine, research/AURORA-DEPTH-PLAN.md §3, binding):
- **The right column is the proof — never occupied, replaced, or displaced.**
- One field + one figure max: step the hero's `.bg-grid` down/off in the SAME
  commit that mounts a sigil.
- One ambient motion source per hero: pass `parallax={false}` when the proof
  artifact is animated or interactive (typing demos, countdowns, live forms).
- `glyph` is the closed 15-slug media-kit union — no mark, no mount
  (bot/forge/insights cannot mount; me-demo is charter-barred).
- Exclusion classes (owner consoles, reading surfaces, integrator sims,
  headless infra, auth gates, deliberately-bare heroes) get NO sigil — see the
  per-property verdict table before mounting anything.
- Registers are automatic: filled letterpress under ember, wireframe under the
  cypherpunk skins. Hidden <640px + forced-colors; frozen under
  reduced-motion + oc_motion. Layer colors are compiled-in color-mixes toward
  --background (contrast ceiling + visibility floor are not consumer-tunable).

Glyph geometry is vendored from oc-media-kit (`build/emit_glyphs.py` →
`src/tokens/glyphs.ts`); `scripts/check-glyph-drift.mjs` guards the sync.

## 0.28.1 — OcSigil emboss visibility (ember-first tuning)

Patch: strengthen the emboss relief ramp so the filled letterpress register
reads on ember (the family default) where the mark sits over the same-hue warm
aurora bloom — the front face is now a defined `--primary` silhouette
(minimum-visibility floor), the back layers still dissolve into `--background`.
No API change; wireframe (cypherpunk) register unaffected.

## 0.28.2 — OcSigil: real 3D extrusion + fix the "orange block"

Two fixes to the emboss:
- The sub-brand glyphs are TILES (filled square + frame + detail); filling `fg`
  rendered a solid block. The sigil now always uses the OUTLINE form
  (`fg="none"`) — the tile drops away, leaving the recognizable framed mark
  (stamp = notary square + anchor), which is thematically an engraved seal.
- The 6 overlapping layers were flat. Now 22 computed layers with real
  z-separation (~63px relief), a lit front face, shadowed extrusion walls, and
  a back that dissolves into `--background` — a true 3D object that catches
  light as it drifts. One treatment, recolored per skin via `--primary`
  (the filled/wireframe register split is retired).

## 0.28.3 — OcSigil: translucent, muted, responsive watermark

Reworks the mark from an opaque corner object into a translucent 3D watermark:
- **Transparent** — the whole relief composites at `--oc-sigil-opacity`
  (0.42 light / 0.5 dark) so the aurora + page read through it.
- **Muted** — softer front-face highlight + shadow ramp; the translucency does
  the rest.
- **Responsive** — size is `clamp(240px, 52vmin, 600px)` by default (was a fixed
  consumer class), and it **stays visible on phones** (smaller + quieter via a
  ≤640px block, `--oc-sigil-size-sm` / `--oc-sigil-opacity-sm`) instead of
  `display:none`.
- Tunables: `--oc-sigil-size`, `--oc-sigil-opacity`, `--oc-sigil-size-sm`,
  `--oc-sigil-opacity-sm`. Consumers no longer need to pass a size class; drop
  the old `h-[…] w-[…]` and let the default scale, or set `--oc-sigil-size`.

## 0.28.4 — OcSigil: light-mode presence + mobile placement

- Light mode washed out at 0.42 (mid terracotta over near-white) — raise the
  default light opacity to 0.58 (dark 0.52) so it reads as present-but-
  translucent.
- On phones the tall single-column hero buried a bottom-anchored mark below
  the fold — re-anchor to the top-right corner (clear of a left-aligned
  headline) so it lands in the first viewport.

## 0.28.5 — OcSigil: quieter in light mode

Light-mode opacity was too prominent — drop the default light opacity to 0.4
(desktop) / 0.28 (mobile). Dark mode is unchanged (0.52 / 0.42).

## 0.28.6 — OcSigil: fix broken per-verb glyphs

The glyph emitter froze every mark in FILLED mode (it passed a sentinel that
never matched the glyphs' `fg=="none"` outline branch), so runtime `fg→none`
made solid-fill marks (vote bars, §, ₿) vanish and body-fill marks (padlock,
A, safe) render as fragments. Emitter now branches on `is_glyph_only`: solid
marks emit filled (→ solid slab), the rest emit in outline mode (tile drops,
frame+detail stroke). All 15 marks verified in the Chrome/Sigil › PerVerb
catalog. Requires the re-generated `glyphs.ts` (vendored from oc-media-kit).

## 0.28.7 — OcSigil: --oc-sigil-ink (mark on a coloured band)

New CSS vars `--oc-sigil-ink` (default `--primary`) and `--oc-sigil-bg`
(default `--background`) let the mark sit on a coloured surface — e.g. the §
riding a `bg-brand` band as a white-on-brand watermark:
`--oc-sigil-ink: var(--brand-foreground); --oc-sigil-bg: var(--brand)`.
See Chrome/Sigil › Band. Backward-compatible (defaults unchanged).

## 0.28.8 — OcAuroraGL is now the family default

`OcThemeProvider` now mounts the GL silk field by DEFAULT: a bare
`<OcThemeProvider>`, `aurora={true}`, or `aurora={{ intensity }}` (no `gl`)
all opt IN. The CSS blobs remain the permanent floor under every failure path,
so no-JS/reduced-motion/no-WebGL/console-throttle behavior is unchanged.

Reading- and console-heavy surfaces should opt OUT to keep dense data flat:
`aurora={{ gl: false }}` (or `{ intensity: 0.5, gl: false }` for docs). Owner
consoles (analytics/bot/forge/fleet) and docs do this. Marketing sites that
already pass `{ gl: true }` are unaffected.

## 0.28.9 — OcSigil: beauty pass (mark surgery, lit relief, two registers)

A ground-up refinement — no consumer API change beyond one new optional prop.
Every `<OcSigil glyph corner />` call site is unchanged.

- **Mark surgery.** The six tile glyphs (stamp/pledge/cosign/me/fleet/docs) shed
  their rounded-square FRAME so the pictogram embosses, not the tile (three
  verbs used to read as the same square debris). Hairline strokes are floored
  and heavy ones capped (0.5–2.0 → 1.3–1.7) so no mark vanishes (vault's body)
  or bloats (lock's shackle) at watermark alpha. Per-verb focus transforms
  optically size each pictogram to fill the canvas. All SSR string transforms
  over the vendored glyphs; `verify-sigil-transforms.mjs` (in `yarn verify`)
  locks the frame-strip hit-count so a glyph re-vendor can't silently break it.
- **Lit relief + two registers.** New endpoint custom properties drive the look:
  `--oc-sigil-lift` (front-face highlight), `--oc-sigil-shade` (wall shadow),
  `--oc-sigil-ink-base` (ember-dark rides the brighter `--brand`). Ember renders
  a lit letterpress relief (a specular leaf catches upper-left, walls sink into a
  chromatic sienna — never achromatic black, which mudded gold to olive); the
  four cypherpunk skins render an unlit crisp echo stack (lift = ink, shade =
  transparent). All color-mix() off the skin's own tokens; nothing hardcoded.
- **Depth melts to transparent** (was: dissolve to a guessed `--background`), so
  the mark composites correctly over the aurora in every skin/mode.
  **`--oc-sigil-bg` is REMOVED** — with the alpha melt the surface shows through
  natively. Band consumers use the new `band` prop instead (below).
- **Calmer pose** — shallower resting yaw, eased `translateZ` (no countable
  "cardboard" bands), filled forms extrude shallower, `perspective: 1600px`,
  a de-metronomed 48s drift, `tanh` parallax. The frozen reduced-motion pose is
  the best-composed frame.
- **Mobile presence floor** — corner-aware mask origin + a light-mode opacity
  floor (0.34) so phones show an identifiable mark, not a smudge.
- **New `band` prop** — `<OcSigil glyph="orangecheck" band />` applies the
  `.oc-sigil--band` deboss preset (band-shaped mask + walls sinking into
  `--brand`). Supply `--oc-sigil-ink` (e.g. `--brand-foreground`). Replaces the
  old `--oc-sigil-bg` band recipe. Under a cypherpunk skin the band follows that
  skin's echo register.
