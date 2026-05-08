# @orangecheck/ui

> **Full reference:** [docs.ochk.io/sdk/ui](https://docs.ochk.io/sdk/ui) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


OrangeCheck family-internal UI for the `.ochk.io` sub-sites.

This package is **not** for third-party integrators. For embeddable
OrangeCheck components (badge, gate, signed-challenge button), see
[`@orangecheck/react`](https://www.npmjs.com/package/@orangecheck/react).

## Components

### `<EcosystemSwitcher current="…" />`

Cross-product dropdown for jumping between every site in the OrangeCheck
family. Pass the active product slug via `current`.

```tsx
import { EcosystemSwitcher } from '@orangecheck/ui';

<EcosystemSwitcher current="lock" />
```

Slugs: `home | docs | attest | lock | vote | stamp | agent | pledge`.

## Required host environment

Family-internal package — assumes the host is an OC sibling app:

- **Next.js 15** (Pages Router or App Router). `<EcosystemSwitcher />` uses
  `next/link` directly.
- **Tailwind 4** with the OrangeCheck theme tokens defined in the host's
  `globals.css`: `--background`, `--foreground`, `--primary`, `--muted`,
  `--muted-foreground`, plus the custom `font-display` and `label-mono`
  utilities.
- **lucide-react** for icons.

If you're not in an OC family `oc-X-web` app, you probably want
`@orangecheck/react` instead.

## License

MIT
