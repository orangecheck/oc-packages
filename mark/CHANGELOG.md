# Changelog

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
