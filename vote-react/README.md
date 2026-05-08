# @orangecheck/vote-react

> **Full reference:** [docs.ochk.io/sdk/vote-react](https://docs.ochk.io/sdk/vote-react) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


Drop-in React components for [OC Vote](https://github.com/orangecheck/oc-vote-protocol). Embed a live tally anywhere in three lines.

```bash
npm i @orangecheck/vote-react react
```

## Components

### `<OcPoll pollId="…" />`

A full poll card — question, option bars, turnout, status pill, "cast a ballot" CTA that opens `vote.ochk.io/p/<id>` in a new tab. Live-refreshes every 60s by default.

```tsx
import { OcPoll } from '@orangecheck/vote-react';

<OcPoll pollId="3054390f047f2703186943a41178bc15931500b5139229517f26e56282026ee5" />
```

### `<OcTallyBadge pollId="…" />`

A compact inline pill showing the top option + its percentage. Use in sidebars, profile cards, feed rows.

```tsx
import { OcTallyBadge } from '@orangecheck/vote-react';

<OcTallyBadge pollId="3054390f…" theme="dark" />
```

### `useTally(pollId, opts?)`

The underlying hook, for custom rendering.

```tsx
import { useTally } from '@orangecheck/vote-react';

function MyPoll({ id }: { id: string }) {
    const { data, error, loading, refetch } = useTally(id, { refreshMs: 30_000 });
    if (loading) return <Spinner />;
    if (error) return <Error msg={error.message} />;
    if (data?.state === 'awaiting_reveal') return <Pending />;
    return <TallyView tallies={data!.tallies!} />;
}
```

## Props (shared)

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `pollId` | `string` | — | 64-hex poll id |
| `theme` | `'light' \| 'dark'` | `'light'` | Colour theme |
| `baseUrl` | `string` | `https://vote.ochk.io` | Override for self-hosted `/api/tally` |
| `refreshMs` | `number` | `60000` | Auto-refresh interval; `0` to disable |
| `initialData` | `TallyResponse` | — | SSR hydration payload (skip initial fetch) |
| `className` | `string` | — | Outer element class |
| `style` | `CSSProperties` | — | Inline style override |

`<OcPoll>` additionally accepts `hideCta` (boolean, default false) to render as read-only without the "cast a ballot" link.

## Why it's read-only

Voting requires a BIP-322 signature from the user's Bitcoin wallet. That's handled by `vote.ochk.io/p/<id>` (or your own fork of `oc-vote-web`) which knows how to talk to UniSat, Xverse, Leather, OKX, Phantom, etc. The CTA in `<OcPoll>` links there.

For **headless** poll creation / voting / revealing, use [`@orangecheck/vote-cli`](https://npmjs.com/package/@orangecheck/vote-cli) instead.

## Styling

Zero CSS dependencies — every component uses inline styles. The built-in themes match the OC family's palette (near-black + bitcoin-orange in dark; near-white + orange in light). Override with `className` + your own CSS, or pass `style` for per-instance tweaks.

## SSR

Works under Next.js App Router (both packages are `'use client'`-marked) and Pages Router. If you want to skip the initial fetch for faster first paint, pre-fetch on the server and pass `initialData`:

```tsx
// Next.js server component / getServerSideProps
const res = await fetch(`https://vote.ochk.io/api/tally?poll=${id}`);
const initialData = await res.json();

// render:
<OcPoll pollId={id} initialData={initialData} />
```

## Verification

This package trusts the `baseUrl` endpoint. For high-value decisions, pair it with an independent run of `@orangecheck/vote-cli tally <id>` — the CLI re-verifies every BIP-322 signature and re-runs the pure tally function. If the two disagree, the CLI is authoritative.

## License

MIT. See [LICENSE](./LICENSE).

## Related

- Protocol: [`orangecheck/oc-vote-protocol`](https://github.com/orangecheck/oc-vote-protocol)
- Web client: [`vote.ochk.io`](https://vote.ochk.io)
- Core library: [`@orangecheck/vote-core`](https://npmjs.com/package/@orangecheck/vote-core)
- CLI: [`@orangecheck/vote-cli`](https://npmjs.com/package/@orangecheck/vote-cli)
- Examples: [`orangecheck/oc-vote-examples`](https://github.com/orangecheck/oc-vote-examples)
