# Changelog

## [0.1.0] — 2026-10-24

- The mark as an SVG string (`markSvg`), an element built without parsing
  (`markElement`, for Trusted Types), a data URI (`markDataUri`), its
  geometry, and a React component (`@orangecheck/mark/react`, react an optional
  peer). Three variants: `mono` in the host's text colour, `brand` as drawn for
  dark grounds, and `tile` on its own ink tile for any ground. Sized in em, with
  no inline styles.
- `assets/`: each variant as an SVG and as PNGs from 16 to 256 px wide, for
  native apps and game engines. A test holds them to what the mark draws.
