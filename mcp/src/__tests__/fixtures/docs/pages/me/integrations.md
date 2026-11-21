# ochk.app · Integrations

**orangecheck sits next to the sign-in providers you already offer.** A
first-time user who picks it needs no wallet, no seed phrase and no "what is a
sat" conversation. If your app pays its users, what they earn shows up in their
account with a receipt for each event. orangecheck holds earned sats while
payouts are in testing; see [ochk.app/custody](https://ochk.app/custody) for who
holds what today, and [federation custody](https://ochk.io/docs/me/federation) for what replaces it.

## See it live first

To run it yourself, [the onboarding examples](https://ochk.io/docs/integration/reference) are open
sites in Node and Python that start offline with no account.

Before you read another paragraph,
[**me-demo.ochk.io**](https://me-demo.ochk.io) is a real orangecheck integration
we built ourselves — a fictional newsletter site (Lumen Notes), styled
deliberately not-orangecheck. Its sign-in button opens the orangecheck popup.
Sign in once and you'll see the sign-in loop end to end. It runs on an `ochk.io`
subdomain, so it gets orangecheck's own session rather than a token bound to its
origin, and it sends no events; the [quickstart](https://ochk.io/docs/me/quickstart) is the path
your site takes.

## Beside your other providers

```tsx
import type { ReactElement } from 'react';

import { SignInWithOrangecheck } from '@orangecheck/me-client/react';
import { signIn } from 'next-auth/react';

export function SignInOptions(): ReactElement {
    return (
        <div className="auth-options">
            <button className="auth-button" onClick={() => signIn('google')}>
                Continue with Google
            </button>
            <button className="auth-button" onClick={() => signIn('apple')}>
                Continue with Apple
            </button>
            <button className="auth-button" onClick={() => signIn('email')}>
                Email me a link
            </button>
            {/* Your button class; it brings the orangecheck mark, the words and the window. */}
            <SignInWithOrangecheck
                className="auth-button"
                onSignedIn={async ({ token }) => {
                    // Your server verifies the token and keeps it in its own cookie.
                    const r = await fetch('/api/auth/session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token }),
                    });
                    if (r.ok) location.assign('/dashboard');
                }}
            />
        </div>
    );
}
```

The orangecheck button takes your button's class and draws nothing of its own.
[The sign-in button](https://ochk.io/docs/integration/sign-in-button) has the props, the rules and a
plain-HTML version.

| What your user sees                     | What your user does NOT see  |
| --------------------------------------- | ---------------------------- |
| a button next to Google / Apple         | a seed phrase                |
| one orangecheck sign-in popup           | a wallet creation flow       |
| signed in on your app                   | a "buy bitcoin" CTA          |
| if you pay your users, sats they earned | any crypto vocabulary at all |

When do they find out? When they want to. [ochk.app/me](https://ochk.app/me)
shows what they earned and where it goes, and
[ochk.app/custody](https://ochk.app/custody) says who holds it today. None of
this is in the sign-in path, and none of it shows unless the person visits.

## Example prices

Prices are yours to set, and only matter if you pay your users. For each event,
set what your user earns. You pay that plus the fee: 20% of the price, rounded
to a whole sat and at least 1 sat, so your user gets about 80%. Earns 100, you
pay 125. Some starting points, for made-up apps:

| Example app    | Event                                | Your user earns     | You pay             |
| -------------- | ------------------------------------ | ------------------- | ------------------- |
| a wallet app   | `account_creation` (One-time)        | 1,600 sats          | 2,000 sats          |
| a wallet app   | `payment_authorization` (Per action) | 0.4% of the payment | 0.5% of the payment |
| a social app   | `session_creation` (Per session)     | 40 sats             | 50 sats             |
| a creator site | `stamp_signing` (Per action)         | 80 sats             | 100 sats            |

There's no "right" price; try numbers in the
[sandbox](https://ochk.app/integrate/sandbox) first. The config schema is open:
see [the SDK reference](https://ochk.io/docs/me/sdk#occonfigvalidate--check-a-price-config-locally)
for the full shape. You edit prices on your project's **Paying** tab, under
**What each event earns**.

## Errors and edge cases

Signing in:

| What you see                    | Meaning                                                                                                                                                                                                                          | Fix                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `signInWithOc()` returns `null` | The person closed the popup, the browser blocked it, your `signal` aborted, or it failed (not in a browser, or the popup's answer was malformed).                                                                                | Call it inside the click handler, so the browser allows the popup. Leave the button there to try again. |
| `401` right after a sign-in     | The token is bound to your origin, and your server's `audience` is missing or a different origin (`http` for `https`, `www`, a port). me-client logs a warning naming `audience` when it can tell.                               | Pass your exact origin as `audience`, in the session route and in `withOcAuth`.                         |
| `403 bond_required`             | The account isn't backed above the bar you set under **Who can sign in**. The body has `need`, `have` and a `back_url`.                                                                                                          | Send the person to `back_url`, where they can back their account.                                       |
| `500 unknown_project_key`       | `projectKey` names no project. me-client logs which key, once. (Before 0.32 this read as a `503`.)                                                                                                                               | Copy the key from your project at [ochk.app/me/projects](https://ochk.app/me/projects).                 |
| `503 revocations_unavailable`   | A write came with a session, and me.ochk.io's list of ended sessions couldn't be read in the last ten minutes, so it can't be vouched for. Reads go on (me-client 0.38.0).                                                       | Retry shortly; the person is still signed in. Check your server can reach me.ochk.io.                   |
| `503 bond_policy_unavailable`   | Your project's sign-in requirement couldn't be read from me.ochk.io, and none was read in the last ten minutes, so a signed-in request is refused, not let through. A request with no session never reads it (me-client 0.37.0). | Retry; the wrapper asks again after ten seconds. Check your server can reach me.ochk.io.                |

Paying your users:

| What you see                                        | Meaning                                                                                                | Fix                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `config_invalid` (422)                              | Your `IntegratorPriceConfig` failed validation server-side, or is outside the platform's price bounds. | Run `oc.config.validate(cfg)` locally first; the response includes `details: [{ subtype, message }]`.   |
| `signature does not match` from `oc.webhook.verify` | Either you parsed the body before verifying, or you're verifying against the wrong or a stale key set. | Use raw body bytes; the key set is `me.ochk.io/api/dev-jwks`, re-fetched with `oc.webhook.fetchJwks()`. |
| `rate_limit_exceeded` (429)                         | You exceeded a per-IP bucket.                                                                          | Honor `Retry-After`; back off exponentially.                                                            |
| `domain_unverified` (403)                           | Your project_key fired in `live` mode but `verification.state !== 'verified'`.                         | Verify your domain to [go live](https://ochk.io/docs/me/quickstart#5--go-live) (DNS TXT or meta tag), then retry.           |
| `invalid_signature`, `signature_required` (401)     | The event's `X-OC-Signature` is wrong or missing.                                                      | Sign the exact bytes you send: see [signing an event](https://ochk.io/docs/me/api#signing-an-event) and every answer there. |

## Self-host considerations

orangecheck is one implementation of the canonical OC primitives. Anyone can run
their own equivalent against the same receipt contracts — that's the product
strategy. If you're considering self-hosting, the contracts to honor are at:

- `oc-attest-protocol/SPEC.md` (identity)
- `oc-attest-protocol/FEDERATION-CUSTODY.md` (v1.2-draft-1 federation custody)
- `oc-stamp-protocol/SPEC.md` (anchored receipts)
- `oc-agent-protocol/SPEC.md` + `FEDERATION.md` (delegations)
- `oc-lock-protocol/SPEC.md` (encrypted DMs)

The hosted service is a convenience, not a moat. Charter commitment 04 on
[ochk.io/about](https://ochk.io/about) is that the protocol sites stay free.
