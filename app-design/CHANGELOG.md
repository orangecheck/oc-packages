# Changelog

## [0.1.2] — 2026-10-15

- Sets `--oc-signin-*`, so the family sign-in ceremony (auth-client ≥ 2.27)
  renders in the app's type: sentence case, pill buttons, rounded fields.

## [0.1.1] — 2026-10-15

- The hero stadium is the deck's rounded square beside the sphere, not a tall
  pill around it. On the live page the pill's curve cut through the headline.

## [0.1.0] — 2026-10-15

First release: the ochk.app design system from Souheila's partner deck.

- Tokens for light and dark, scoped to `data-oc-app="ochk"`. The deck's orange as
  text (2.81:1) is replaced by two darker shades of the same hue for display and
  small text; fills keep it.
- Inter (weight and optical size) and JetBrains Mono, self-hosted with
  metric-matched fallbacks.
- The isometric check measured from the deck, the app icon, the lockup, and the
  halftone sphere with `scripts/halftone.py` to make its dot layer.
- Primitives on Radix, composites for every slide of the deck, and the public and
  signed-in chrome.
- Contrast and isolation checks as `yarn test`.
