# `@orangecheck/react`

React components for OrangeCheck. Three focused primitives:

- **`<OcBadge>`** — display a proof-of-Bitcoin-stake badge (inline pill or card).
- **`<OcGate>`** — client-side conditional render based on OC status.
- **`<OcChallengeButton>`** — run the signed-challenge auth flow in-browser.

Zero styling framework required. No global CSS. Inline styles so the components render correctly in any host app.

```bash
yarn add @orangecheck/react
```

React 18 or 19. `@orangecheck/sdk` is a peer dependency (pulled in automatically).

---

## `<OcBadge>`

Render a proof using data from `check()` or `verify()`:

```tsx
import { OcBadge } from '@orangecheck/react';
import { check } from '@orangecheck/sdk';

const r = await check({ addr });
return (
    <OcBadge
        address={r.address!}
        sats={r.sats}
        days={r.days}
        score={r.score}
        variant="card" // or "compact" (default)
        theme="dark" // or "light" (default)
    />
);
```

Props:

| Prop        | Type                       | Default               | Notes                               |
| ----------- | -------------------------- | --------------------- | ----------------------------------- |
| `address`   | `string`                   | —                     | Bitcoin address bound to the proof. |
| `sats`      | `number`                   | —                     | Sats bonded.                        |
| `days`      | `number`                   | —                     | Days unspent.                       |
| `score`     | `number`                   | `compute(sats, days)` | Optional; computed if omitted.      |
| `algorithm` | `'v0' \| 'tier' \| 'none'` | `'v0'`                | Score display mode.                 |
| `variant`   | `'compact' \| 'card'`      | `'compact'`           | Inline pill vs full card.           |
| `theme`     | `'light' \| 'dark'`        | `'light'`             | Colour theme.                       |
| `hideScore` | `boolean`                  | `false`               | Show raw metrics only.              |

---

## `<OcGate>`

Render `children` only when the subject's OrangeCheck proof passes your thresholds.

```tsx
import { OcGate } from '@orangecheck/react';

<OcGate
    address={userBtcAddress}
    minSats={100_000}
    minDays={30}
    loading={<Spinner />}
    fallback={<Callout>You need at least 100k sats bonded for 30 days to post.</Callout>}
>
    <CommentForm />
</OcGate>;
```

Or pass a render-prop to get the resolved `CheckResult`:

```tsx
<OcGate address={addr} minSats={100_000}>
    {(result) => <p>You have {result.sats.toLocaleString()} sats bonded.</p>}
</OcGate>
```

> **Security warning.** `<OcGate>` is a _UI convenience_, not a security boundary. An adversary can bypass client state trivially. Real access control must happen on the server — use `@orangecheck/gate` or call `/api/check` directly from your API route.

---

## `<OcChallengeButton>`

Run the signed-challenge flow end-to-end — issue challenge → user signs → server verifies → your `onVerified` callback fires with the proven address.

```tsx
import { OcChallengeButton } from '@orangecheck/react';

<OcChallengeButton
    address={userAddr}
    sign={(msg) => window.unisat.signMessage(msg, 'bip322-simple')}
    audience="https://example.com"
    purpose="login"
    onVerified={({ address, nonce }) => {
        // Address is cryptographically proven. Attach to session.
        console.log('verified:', address);
    }}
    onError={(e) => console.error(e)}
>
    Sign in with Bitcoin
</OcChallengeButton>;
```

Because every wallet's signing API is different (UniSat, Xverse, Leather, Alby, paste-from-Sparrow), the component takes a **`sign` prop** — you supply the adapter, the component handles the rest.

Adapter examples:

```tsx
// UniSat
(msg) => (window as any).unisat.signMessage(msg, 'bip322-simple');

// Xverse / Sats Connect
async (msg) => {
    const r = await signMessage({
        payload: { network: { type: 'Mainnet' }, address: userAddr, message: msg },
    });
    return r.signature;
};

// Alby (Liquid Browser)
(msg) => (window as any).webln.signMessage(msg);

// Manual / hardware wallet — pop a dialog, user pastes a signature
async (msg) => {
    const sig = prompt(`Sign the message below in Sparrow, paste signature:\n\n${msg}`);
    if (!sig) throw new Error('cancelled');
    return sig;
};
```

---

## Subpath imports (for tree-shaking)

```ts
import { OcBadge } from '@orangecheck/react/badge';
import { OcChallengeButton } from '@orangecheck/react/challenge';
import { OcGate } from '@orangecheck/react/gate';
```

---

## License

MIT. The OrangeCheck protocol is CC-BY-4.0.
