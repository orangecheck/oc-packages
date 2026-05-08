# `@orangecheck/wallet-adapter`

> **Full reference:** [docs.ochk.io/sdk/wallet-adapter](https://docs.ochk.io/sdk/wallet-adapter) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


**Normalize browser Bitcoin wallets behind a single `sign(message)` API.**

UniSat, Xverse, Leather, Alby — every wallet exposes a different signing API. This package hides that behind one shape:

```ts
const sign = getSigner('unisat', { address });
const signature = await sign(message);
```

Pairs cleanly with `<OcChallengeButton sign={sign} />` from `@orangecheck/react`, or with the lower-level primitives.

```bash
yarn add @orangecheck/wallet-adapter
```

React components are under a subpath to keep the core library zero-dep:

```ts
import { detectWallets, getSigner } from '@orangecheck/wallet-adapter';
import { OcWalletButton } from '@orangecheck/wallet-adapter/react';
```

---

## `detectWallets()`

Return every supported wallet with a `detected` flag.

```ts
import { detectWallets } from '@orangecheck/wallet-adapter';

detectWallets();
// [
//   { id: 'unisat',  name: 'UniSat',  detected: true,  installUrl: '...' },
//   { id: 'xverse',  name: 'Xverse',  detected: false, installUrl: '...' },
//   { id: 'leather', name: 'Leather', detected: false, installUrl: '...' },
//   { id: 'alby',    name: 'Alby',    detected: true,  installUrl: '...' },
//   { id: 'manual',  name: 'Paste signature (Sparrow / Core / hardware)',
//     detected: true, isManual: true }
// ]
```

Use to render install prompts for missing wallets and "sign with" buttons for installed ones.

---

## `getSigner(id, { address })`

Return a `SignFn` bound to a particular wallet.

```ts
import { getSigner } from '@orangecheck/wallet-adapter';

const sign = getSigner('unisat', { address: userBtcAddress });
const signature = await sign(canonicalMessage);
```

`SignFn` is `(message: string) => Promise<string>`. Throws when the wallet isn't available or the user cancels.

---

## `<OcWalletButton />` (React)

Pre-built wallet picker that detects installed wallets, lets the user pick one, and calls `onSigned` with the signature.

```tsx
import { OcWalletButton } from '@orangecheck/wallet-adapter/react';

<OcWalletButton
    address={userBtcAddress}
    message={challenge.message}
    onSigned={(sig, walletId) => {
        console.log(`${walletId} returned`, sig);
        postVerify({ signature: sig });
    }}
    onError={(err) => console.error(err)}
/>;
```

Props:

| Prop                 | Type                      | Notes                                                            |
| -------------------- | ------------------------- | ---------------------------------------------------------------- |
| `address`            | `string`                  | Required by some wallets (Xverse, Leather).                      |
| `message`            | `string`                  | Canonical message to sign (e.g. from `/api/challenge`).          |
| `onSigned`           | `(sig, walletId) => void` | Success callback.                                                |
| `onError`            | `(err, walletId) => void` | Failure callback.                                                |
| `hideUninstalled`    | `boolean`                 | Default `false` — uninstalled wallets render as install prompts. |
| `heading`            | `ReactNode`               | Header text. Default "Sign with your wallet".                    |
| `className`, `style` |                           | Pass-through for the root container.                             |

---

## Full example — signed-challenge auth with wallet picker

```tsx
import { useState } from 'react';
import { OcWalletButton } from '@orangecheck/wallet-adapter/react';

export function SignIn({ address }: { address: string }) {
  const [step, setStep] = useState<'idle' | 'ready' | 'done'>('idle');
  const [message, setMessage] = useState('');
  const [proven, setProven] = useState('');

  async function issueChallenge() {
    const r = await fetch(`/api/challenge?addr=${address}`);
    const { message } = await r.json();
    setMessage(message);
    setStep('ready');
  }

  async function handleSigned(signature: string) {
    const r = await fetch('/api/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, signature }),
    });
    const body = await r.json();
    if (body.ok) {
      setProven(body.address);
      setStep('done');
    }
  }

  if (step === 'idle') return <button onClick={issueChallenge}>Start sign-in</button>;
  if (step === 'ready') {
    return <OcWalletButton address={address} message={message} onSigned={handleSigned} />;
  }
  return <p>Signed in as {proven}</p>;
}
```

---

## Wallet details (for the curious)

| Wallet       | Global                                                                                    | BIP-322 style                                                    |
| ------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| UniSat       | `window.unisat.signMessage(msg, 'bip322-simple')`                                         | Simple                                                           |
| Xverse       | `window.BitcoinProvider.request('signMessage', { address, message, protocol: 'BIP322' })` | Full                                                             |
| Leather      | `window.LeatherProvider.request('signMessage', { message, paymentType: 'p2tr' })`         | Full                                                             |
| Alby / WebLN | `window.webln.signMessage(msg)`                                                           | Raw message (not BIP-322 on all addresses — works best for `1…`) |
| Manual       | Browser `prompt()`                                                                        | Caller's wallet produces the signature out-of-band               |

The shims are duck-typed — we check shape, not just presence of globals, so spoofing wrappers don't produce false positives.

> **Heads up on Alby:** `webln.signMessage` signs raw bytes, not BIP-322. It tends to produce an OrangeCheck-compatible signature on legacy P2PKH addresses (starting with `1`), but not on segwit (`bc1q…`) or taproot (`bc1p…`). For the general case, prefer UniSat / Xverse / Leather, and offer the **paste** option as a fallback so users on hardware wallets (Sparrow, Bitcoin Core, Ledger) can still sign.

> **Security note on detection:** `XverseProviders` used to pass if it was any truthy value. As of `0.1.1` we require a callable `BitcoinProvider.request` function so a bookmarklet or unrelated extension setting `window.XverseProviders = {}` won't register as Xverse.

> **UniSat fallback:** earlier versions silently fell back from `bip322-simple` to the legacy ECDSA `signMessage` on any error. That produced signatures segwit/taproot verifiers couldn't accept. As of `0.1.1` we only sign BIP-322 — if the wallet throws, the error propagates so the caller can suggest switching wallets or using paste mode.

---

## License

MIT.
