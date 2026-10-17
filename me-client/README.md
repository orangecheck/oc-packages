# @orangecheck/me-client

> **Full reference:** [docs.ochk.io/sdk/me-client](https://docs.ochk.io/sdk/me-client) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


Client for [me.ochk.io](https://me.ochk.io). Popup sign-in for any site, framework-agnostic server-side verification, session lifecycle hooks, payment authorization, webhook signature verification, the canonical billable-event taxonomy as TypeScript types. `OcSignInButton` rides the family cookie, so it works only on orangecheck's own sites; anywhere else, sign people in with `signInWithOc()` from `/popup`.

> Sign-in is free. Paying your users is optional: always, in promos you schedule, or never.

## Three entry points, three audiences

```ts
// oc.session/payment/event/config/webhook/scope/identity
import { oc } from '@orangecheck/me-client';

// The React provider and hook live in the companion package.
import { OcSessionProvider, useOcSession } from '@orangecheck/auth-client';

// Server-side verification — Next.js, Express, Hono. Zero env vars,
// zero JWK handling. SDK lazy-fetches and caches the JWKS.
import { withOcAuth, ocAuthExpress, ocAuthHono } from '@orangecheck/me-client/server';

// Browser-only popup orchestrator — same shape Google / GitHub use.
import { signInWithOc } from '@orangecheck/me-client/popup';
```

## Install

```sh
yarn add @orangecheck/me-client @orangecheck/auth-client
```

## Quick start

Sign people in with a popup, then verify the token on your server. Any orangecheck account works: email, Google, GitHub or a Bitcoin wallet.

```ts
// Browser · inside a click handler (browsers block popups outside one).
import { signInWithOc } from '@orangecheck/me-client/popup';

const result = await signInWithOc();
if (result) {
    // A token bound to your origin. Send it to your server as a Bearer.
    await fetch('/api/me', { headers: { Authorization: `Bearer ${result.token}` } });
}
```

```ts
// Server · pages/api/me.ts
import { withOcAuth } from '@orangecheck/me-client/server';

export default withOcAuth(
    async (req, res) => {
        res.status(200).json({ did_oc: req.ocSession!.did_oc });
    },
    { required: true, audience: 'https://your-site.example' }
);
```

## Ask for accounts backed by bitcoin

A person can back their account with one coin they hold (oc-attest-protocol `BOND.md`). The coin stays in their wallet and you never see it: the token carries only floors (`sats_floor`, `days_floor`), when ochk.io last checked the coin (`checked_at`), and a `nullifier`. The nullifier is the same for that coin at your site and unrelated everywhere else, and only ochk.io holds the key that computes it, so it doesn't reveal the coin. Keep one account per nullifier: that is the real bot check at your site. Ban the nullifier and you've banned the coin until it moves, which restarts its age.

Nobody needs a bond to sign in. To let in only backed accounts, set the floor in your project's settings ("who can sign in") and pass your project key. A change there is enforced within a minute:

```ts
export default withOcAuth(handler, {
    audience: 'https://your-site.example',
    projectKey: 'pk_live_yourapp', // reads the floor you set; change it there, not here
});
```

Or set it in code with `requireBond: { minSats: 100_000, minDays: 30, maxAgeSecs: 3600 }`. ochk.io re-checks the coin when its last check is over ten minutes old; `maxAgeSecs` refuses a claim checked longer ago than you accept. From 0.28.0, an account below the floor gets `403 { ok: false, reason: 'bond_required', need: { min_sats, min_days }, have: { sats_floor, days_floor } | null, back_url }`: link the person to `back_url` to back their account. If the project's setting can't be read and never has been, the request gets `503 { reason: 'bond_policy_unavailable' }` rather than being let through unchecked. `readBondClaim(session)` and `bondMeets(session, { minSats, minDays, maxAgeSecs })` are exported for your own checks.

## Pay your users, when you choose to

Paying the people who use your app is optional. In your project's dashboard you turn it on, schedule promos ("Launch week", Oct 20 to 27), or leave it off. While a pay period runs, each event you send earns the person their share and takes its fee from your balance. Outside every period an event earns and costs nothing, and me.ochk.io records nothing, so you can fire events from code that runs all the time:

```ts
const res = await oc.event.fire({
    project_key: 'pk_live_yourcompany',
    subtype: 'account_creation',
    signingSecret: process.env.OC_SIGNING_SECRET,
    userAddress: didOc,
});
if (!res.earned) {
    // res.reason === 'not_paying'; res.next_pay_period says when paying starts, if scheduled
}
```

`fireBatch` answers `not_paying` per event. `GET /api/integrator/config` publishes the project's `pay_periods`, past ones included, and `payingAt(periods, date)` tells you whether a project pays at a moment. Pass them to `oc.event.verify(envelope, config, amount, { payPeriods })` to flag a receipt billed outside every period.

## Session lifecycle

Sessions are the billable atom for me.ochk.io: your server fires one `session_creation` event per real session with `oc.event.fire`. `oc.session.create` opens a session and records no charge, and a signin within a still-valid session is **free**. Site declares the policy at integration time; the OC verifier enforces it both client-side and server-side.

```ts
import { oc } from '@orangecheck/me-client';

// open a session — records no charge; bill it with oc.event.fire({ subtype: 'session_creation', … })
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

## Server-side verification

Verify the OC session on your backend without writing a JWK fetcher, an env-var loader, or a cache. The SDK does that internally.

### Next.js Pages Router

```ts
// pages/api/me.ts
import { withOcAuth } from '@orangecheck/me-client/server';

export default withOcAuth(async (req, res) => {
    if (!req.ocSession) return res.status(401).json({ ok: false });
    res.status(200).json({
        account: {
            id: req.ocSession.sub,
            did_oc: req.ocSession.did_oc,
        },
    });
});
```

Pass `{ required: true }` to short-circuit unauthenticated requests with a 401 before your handler runs, and `audience` (your origin) to verify cross-domain tokens.

### Express

```ts
import express from 'express';
import { ocAuthExpress } from '@orangecheck/me-client/server';

const app = express();
app.use(ocAuthExpress());

app.get('/api/profile', (req, res) => {
    if (!req.ocSession) return res.status(401).json({ error: 'sign in' });
    res.json({ did_oc: req.ocSession.did_oc });
});
```

### Hono / Cloudflare Workers / Bun / Deno

```ts
import { Hono } from 'hono';
import { ocAuthHono } from '@orangecheck/me-client/server';

const app = new Hono();
app.use('*', ocAuthHono());

app.get('/api/me', (c) => {
    const session = c.get('ocSession');
    if (!session) return c.json({ ok: false }, 401);
    return c.json({ did_oc: session.did_oc });
});
```

`getOcSession(headers)` is the framework-agnostic primitive: pass a Web `Headers` object or a plain `{ cookie, authorization }` object. Cookie auth (family `*.ochk.io`) and Bearer auth (cross-domain) are handled identically.

## Browser popup signin

```tsx
import { signInWithOc } from '@orangecheck/me-client/popup';

button.addEventListener('click', async () => {
    const result = await signInWithOc();
    if (!result) return; // user cancelled or popup blocked
    // Cross-domain integrators only — same-origin family integrators
    // (.ochk.io) skip this; the cookie rides automatically.
    localStorage.setItem('oc-token', result.token);
    location.assign('/dashboard');
});
```

`signInWithOc()` MUST be called inside a user-gesture handler (browsers block `window.open` outside of gestures). Returns `{ account, token }` on success, `null` on cancel / popup block / abort. Pins both `event.origin` AND `event.source === popup` on the postMessage handler so a same-origin attacker can't settle the promise.

## Custom origin

For staging, self-hosted me-equivalents, or local dev:

```ts
import { setOrigin } from '@orangecheck/me-client';

setOrigin('https://me.example-staging.com');
```

## License

MIT.
