# Changelog

## [0.4.0] — 2026-11-19

The mark is drawn as the ochk.app design draws it: the same check, its sides
twice as deep.

- The box is 16×10 (was 16×8): the left and right faces drop 4 units, not 2.
  `MARK_POINTS.left`, `.right` and `MARK_VIEWBOX` change; the top face does not.
  At button size the check has weight and reads as a check, not a dash.
- Brand's top face is `#F5F2EF`, near-white (was peach `#FED8AB`). Still for
  dark grounds only: on white it is about 1.1:1.
- The aspect is 8:5: `markSvg()` is `1.6em` wide and `1em` tall by default
  (was `1.75em` by `0.875em`), one line of text tall. The tile is `1.5em` (was
  `1.25em`), and its mark is re-centred for the deeper sides.
- `pixel: true` draws the design's pixel mark from the same three faces: 32×20 cells,
  two per unit, `shape-rendering="crispEdges"`. It is crisp at 32 px wide and
  its multiples, and the pixel tile (48×48 cells) at 48 px and its multiples.
  `MARK_PIXEL`, `MARK_PIXEL_TILE` and `MARK_PIXEL_RUNS` (each face as runs of
  cells) are exported. A test holds it to the design's drawing cell by cell.
- `markPixelRuns(perUnit)` gives the same check's cells at any whole-cell scale:
  1 (16×10 cells, beside small type), 1.5 (24×15) or 2 (32×20, the design's). A
  renderer that draws its own pixel check takes its cells from here.
- `assets/`: every file is redrawn, and `orangecheck-mark-pixel-brand` (PNGs at
  32 to 512 px) and `orangecheck-mark-pixel-tile` (48 to 480 px) are added. A
  bare mark's PNG is 5/8 as tall as it is wide (was half). The favicon set is
  redrawn from the new tile.

## [0.3.0] — 2026-10-24

- `assets/favicon/`: a site's icon set drawn from the tile (SVG, ICO with 16,
  32 and 48 px, PNG favicons, a 180 px home-screen icon with square corners,
  and 192 and 512 px manifest icons), so every orangecheck site shows the same
  check in its tab. A test holds each file to its size and corners, and reads
  the ICO's directory.

## [0.2.0] — 2026-10-24

- The mark is larger by default, `1.75em` wide (was `1.5em`): at 16px text it
  is 28×14px, and its check reads as the check, not a dash.
- Mono faces step further apart: the sides at 0.6 and 0.3 (were 0.7 and 0.45).
  These give the widest smallest step between neighbouring faces and the
  ground across light, dark, amber and brown buttons; a test holds every one to
  1.6:1 or more. 0.1.0's weights stepped 1.47:1 on white text over brown.
- `flat: true` draws mono as one shape at full strength, for forced colours.
- PNGs at 40 and 80px wide (20px tall and its 2x), for game UIs sized by height.
- TRADEMARK.md: what the mark may be used for, and how.

## [0.1.0] — 2026-10-24

- The mark as an SVG string (`markSvg`), an element built without parsing
  (`markElement`, for Trusted Types), a data URI (`markDataUri`), its
  geometry, and a React component (`@orangecheck/mark/react`, react an optional
  peer). Three variants: `mono` in the host's text colour, `brand` as drawn for
  dark grounds, and `tile` on its own ink tile for any ground. Sized in em, with
  no inline styles.
- `assets/`: each variant as an SVG and as PNGs from 16 to 256 px wide, for
  native apps and game engines. A test holds them to what the mark draws.
