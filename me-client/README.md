# @orangecheck/me-client

Drop-in client for [me.ochk.io](https://me.ochk.io). Sign-in-with-OC button, session lifecycle hooks, payment authorization, developer telemetry, and the canonical billable-event taxonomy as TypeScript types.

> You pay for sessions and actions, not for clicks.

## Install

```sh
yarn add @orangecheck/me-client @orangecheck/auth-client
```

## Quick start

```tsx
import { OcSignInButton, useOcSession } from '@orangecheck/me-client';
import { OcSessionProvider } from '@orangecheck/auth-client';

export function App() {
    return (
        <OcSessionProvider>
            <SignIn />
        </OcSessionProvider>
    );
}

function SignIn() {
    const { account, status } = useOcSession();
    if (status === 'authenticated') {
        return <p>signed in as {account.address.slice(0, 8)}…</p>;
    }
    return (
        <OcSignInButton
            scope={['identity', 'attest_tier']}
            sessionPolicy={{ duration_seconds: 7 * 86_400, refresh: 'sliding' }}
            onSignin={(session) => console.log('class C envelope:', session)}
        />
    );
}
```

## Session lifecycle

Sessions are the billable atom for me.ochk.io. A signin within a still-valid session is **free** — no Class C event, no charge. Site declares the policy at integration time; the OC verifier enforces it both client-side and server-side.

```ts
import { oc } from '@orangecheck/me-client';

// open a session — Class C billable event, once per real session
const session = await oc.session.create({
    scope: ['identity', 'payment'],
    sessionPolicy: {
        duration_seconds: 60 * 15, // 15 minutes — banking-shaped
        refresh: 'sliding',
        sensitive_actions: 're-auth',
    },
});

// refresh inside the session — FREE, telemetry only
await oc.session.refresh(session.id);

// invalidate when the user signs out — FREE
await oc.session.invalidate(session.id);
```

### Typical session policies

| kind             | label                              | billable atom                              |
|------------------|------------------------------------|--------------------------------------------|
| banking-shaped   | 15–60 minute sessions              | every session                              |
| standard SaaS    | 7–30 day sessions, sliding refresh | session creation only                      |
| mobile app       | 90-day session with refresh        | initial creation, sensitive-action re-auth |

## Payment authorization

Class B billable event. Sub-Stripe rates (0.5–1.0% percentage-based). The user receives ~65% of the OC fee as Lightning cashback on `/me/earn`.

```ts
import { oc } from '@orangecheck/me-client';

const payment = await oc.payment.authorize({
    identity: session.identity,
    amount_sats: 240_000,
    description: 'breez · march invoice',
});
```

## Developer telemetry

Non-billable events the SDK emits for site-side observability. Subscribe with `onTelemetry`. None of these create billable records.

```ts
import { onTelemetry } from '@orangecheck/me-client';

const unsubscribe = onTelemetry((event) => {
    // event.code: 'session.token_refresh' | 'session.intra_signin' |
    //             'session.navigation' | 'auth.signin_failed' |
    //             'auth.signin_cancelled' | 'auth.signin_rejected' |
    //             'verify.passive_check'
    console.log('[oc telemetry]', event);
});
```

See [me.ochk.io/integrate](https://me.ochk.io/integrate) for the full price-band table, the "what you do not pay for" panel, and the live SDK reference.

## Types

Every event class, subtype, and price band is exported as a TypeScript type so integrators can typecheck against the canonical taxonomy:

```ts
import type {
    BillableEvent,
    EventClass,         // 'A' | 'B' | 'C'
    EventSubtype,       // every subtype across all three classes
    SessionPolicy,
    PaymentResult,
    TelemetryEvent,
} from '@orangecheck/me-client';
```

The canonical source of truth lives at [oc-me-web/src/lib/events/types.ts](https://github.com/orangecheck/oc-me-web/blob/main/src/lib/events/types.ts). This package mirrors that shape — any change there ships here in the next minor.

## Custom origin

For staging, self-hosted me-equivalents, or local dev:

```ts
import { setOrigin } from '@orangecheck/me-client';

setOrigin('https://me.example-staging.com');
```

## License

MIT.
