# Changelog

All notable changes to **`@orangecheck/ui`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). This package is family-internal
(consumed only by the `*.ochk.io` sub-sites); the surface is intentionally
small and the API may evolve quickly.

## [Unreleased]

- _(no pending changes)_

## [0.10.0] — Copyable identity

- `<OcAccountMenu>` / `<OcAccountMenuView>` — the `did_oc` row in the
  popover header is now a one-click copy-to-clipboard affordance. Clicking
  anywhere on the address copies the full `did_oc` and flips the trailing
  glyph from a copy icon to a check for ~1.6s; the popover stays open so
  the confirmation is visible. Falls back to a hidden-`<textarea>` copy in
  non-secure contexts, and announces the result via an `aria-live` region.
  No API change — every consuming site picks this up by bumping the dep.

## [0.1.0] — Initial published state

Initial public release. Family-internal UI for the `.ochk.io` sub-sites:

- `<EcosystemSwitcher>` — cross-product dropdown for jumping between every
  site in the OrangeCheck family. Lifted out of seven near-identical copies
  living in each web repo.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/ui-v0.10.0...HEAD
[0.10.0]: https://github.com/orangecheck/oc-packages/releases/tag/ui-v0.10.0
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/ui-v0.1.0
