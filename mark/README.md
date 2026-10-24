# @orangecheck/mark

The orangecheck mark, with no dependencies: an isometric check on a 16×8 grid,
three faces. For a "Sign in with orangecheck" button, a page, a native app or a
game. The button itself is in [`@orangecheck/me-client`](https://www.npmjs.com/package/@orangecheck/me-client)
(`/button`, `/react`); the rules for using it are at
[ochk.io/docs/integration/sign-in-button](https://ochk.io/docs/integration/sign-in-button).

```sh
npm install @orangecheck/mark
```

## Variants

| Variant | Draws | Use it |
|---|---|---|
| `mono` | one colour, `currentColor` by default; the check at full strength, the sides lighter | anywhere the text beside it has 3:1 contrast with the ground: it takes the host's text colour |
| `brand` | the three oranges as drawn | on dark grounds only (the top face is about 1.3:1 on white) |
| `tile` | the three oranges on their own ink tile | on any ground |

## Framework-free

```js
import { markSvg } from '@orangecheck/mark';

button.insertAdjacentHTML('afterbegin', markSvg({ variant: 'mono' }));
```

`markSvg()` returns an `<svg>` sized `1.5em` wide (the tile `1.25em`), so it
follows the font size of the text beside it. Width and height are attributes,
never inline styles: any stylesheet can resize it, and a strict
Content-Security-Policy needs nothing. Without a `title` it is decoration
(`aria-hidden`); the button's label names it.

`markElement(document, options)` builds the same `<svg>` node by node, with no
HTML parsing: use it where Trusted Types or a strict CSP refuse `innerHTML`.

`markDataUri({ variant, color })` gives a `data:image/svg+xml` URI for CSS and
`<img>`. A mono mark in an image needs an explicit `color`: an image inherits
none.

The geometry is exported for renderers that draw their own: `MARK_POINTS`,
`MARK_VIEWBOX`, `MARK_FACES`, `MARK_MONO_OPACITY`, `MARK_TILE`, and
`MARK_MIN_PX` (16: the smallest width it may be drawn at).

## React

```tsx
import { OrangecheckMark } from '@orangecheck/mark/react';

<OrangecheckMark variant="mono" />;
```

`react` is an optional peer: the main entry never loads it.

## Files for native apps and games

`assets/svg/` holds each variant as a standalone SVG (`orangecheck-mark-brand`,
`-tile`, `-mono` in currentColor, `-mono-black`, `-mono-white`), and
`assets/png/` the same at 16, 24, 32, 48, 64, 96, 128 and 256 px wide. Godot 4
imports the SVGs directly: set a `Button`'s `icon` to the mono SVG and keep your
theme's font and colours.

```text
node_modules/@orangecheck/mark/assets/png/orangecheck-mark-mono-white-32.png
```

## Licence and the mark

The code and the files are MIT. The mark is orangecheck's trademark, and the MIT
licence grants no trademark rights: using it to show that a sign-in goes through
orangecheck is fine, as long as it is never more prominent than your own brand
and is drawn only in the variants above. See
[TRADEMARK.md](https://github.com/orangecheck/oc-packages/blob/main/TRADEMARK.md).
