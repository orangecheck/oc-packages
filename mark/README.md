# @orangecheck/mark

The orangecheck mark, with no dependencies: an isometric check on a 16×10 grid,
three faces, drawn smooth or in pixels. For a "Sign in with orangecheck" button, a page, a native app or a
game. The button itself is in [`@orangecheck/me-client`](https://www.npmjs.com/package/@orangecheck/me-client)
(`/button`, `/react`); the rules for using it are at
[ochk.io/docs/integration/sign-in-button](https://ochk.io/docs/integration/sign-in-button).

```sh
npm install @orangecheck/mark
```

## Variants

| Variant | Draws | Use it |
|---|---|---|
| `mono` | one colour, `currentColor` by default; the check at full strength, the sides at 0.6 and 0.3 | anywhere the text beside it has 3:1 contrast with the ground: it takes the host's text colour |
| `brand` | as drawn: a near-white check on two oranges | on dark grounds only (the top face is about 1.1:1 on white) |
| `tile` | the brand faces on their own ink tile | on any ground |

## Framework-free

```js
import { markSvg } from '@orangecheck/mark';

button.insertAdjacentHTML('afterbegin', markSvg({ variant: 'mono' }));
```

`markSvg()` returns an `<svg>` sized `1.6em` wide and `1em` tall (the tile
`1.5em` square), so it follows the font size of the text beside it. Width and height are attributes,
never inline styles: any stylesheet can resize it, and a strict
Content-Security-Policy needs nothing. Without a `title` it is decoration
(`aria-hidden`); the button's label names it.

`pixel: true` draws the pixel mark, the ochk.app design's drawing of the same check: 32×20
cells, two per unit of the geometry. Pixels stay hard only where a cell is a
whole number of device pixels, so draw it 32, 64, 96 or 128 px wide (the pixel
tile, 48×48 cells, at 48, 96, 144 or 192 px). Use the smooth mark at text size,
inside a button.

```js
markSvg({ variant: 'tile', pixel: true, width: '96' });
```

`flat: true` draws mono with every face at full strength: one shape, for forced
colours or anything that cannot shade.

`markElement(document, options)` builds the same `<svg>` node by node, with no
HTML parsing: use it where Trusted Types or a strict CSP refuse `innerHTML`.

`markDataUri({ variant, color })` gives a `data:image/svg+xml` URI for CSS and
`<img>`. A mono mark in an image needs an explicit `color`: an image inherits
none.

The geometry is exported for renderers that draw their own: `MARK_POINTS`,
`MARK_VIEWBOX`, `MARK_FACES`, `MARK_MONO_OPACITY`, `MARK_TILE`, `MARK_PIXEL`,
`MARK_PIXEL_TILE`, `MARK_PIXEL_RUNS` (each face as `[x, y, length]` runs of
cells), and `MARK_MIN_PX` (16: the smallest width it may be drawn at).
`markPixelRuns(perUnit)` gives the pixel check's cells at 1, 1.5 or 2 cells a
unit (16×10, 24×15 or 32×20), for a renderer drawing its own pixel lockup.

## React

```tsx
import { OrangecheckMark } from '@orangecheck/mark/react';

<OrangecheckMark variant="mono" />;
```

`react` is an optional peer: the main entry never loads it.

## Files for native apps and games

`assets/svg/` holds each variant as a standalone SVG (`orangecheck-mark-brand`,
`-tile`, `-mono` in currentColor, `-mono-black`, `-mono-white`), and
`assets/png/` the same at 16, 24, 32, 40, 48, 64, 80, 96, 128 and 256 px wide
(the bare mark is 5/8 as tall: `-32` is 20px tall, `-64` its 2x).
`orangecheck-mark-pixel-brand` and `orangecheck-mark-pixel-tile` are the pixel
mark, as SVG and as PNGs at whole pixels per cell: 32 to 512 px wide, and the
tile 48 to 480 px. Godot 4
imports the SVGs directly: set a `Button`'s `icon` to the mono SVG and keep your
theme's font and colours.

```text
node_modules/@orangecheck/mark/assets/png/orangecheck-mark-mono-white-32.png
```

## A site's icons

`assets/favicon/` is a site's icon set, drawn from the tile, under the names
family sites already link: `favicon.svg`, `favicon.ico` (16, 32 and 48 px),
`favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png`,
`apple-touch-icon.png` (180 px, square corners: iOS rounds it) and
`android-chrome-192x192.png` / `-512x512.png` for a web manifest. Copy them
into `public/`. They are orangecheck's own icons: for orangecheck's sites, not
for yours (see TRADEMARK.md).

## Licence and the mark

The code and the files are MIT. The mark is a trademark of OrangeCheck, and the
MIT licence grants no trademark rights: using it to show that a sign-in goes
through orangecheck is fine, as long as it is never more prominent than your own
brand and is drawn only in the variants above. See [TRADEMARK.md](./TRADEMARK.md).
