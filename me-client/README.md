# @orangecheck/me-client

> **Full reference:** [ochk.io/docs/sdk/me-client](https://ochk.io/docs/sdk/me-client) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


Client for [me.ochk.io](https://me.ochk.io). Popup sign-in for any site, framework-agnostic server-side verification, session lifecycle hooks, payment authorization, webhook signature verification, the canonical billable-event taxonomy as TypeScript types. Sign people in with `signInWithOc()` from `/popup`. No React needed.

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

// Keep your own login: make an orangecheck account for your user (OC Connect).
import { connectProvision } from '@orangecheck/me-client/server';
import { CONNECT_CONSENT_LABEL } from '@orangecheck/me-client/connect-consent';
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
    // A token bound to your origin. Hand it to your server once; it keeps it
    // in an httpOnly cookie, out of reach of your page's scripts.
    await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: result.token }),
    });
}
```

```ts
// Server · pages/api/auth/session.ts
import { verifyOcToken } from '@orangecheck/me-client/server';

export default async function session(req, res) {
    const token = String(req.body?.token ?? '');
    const s = await verifyOcToken(token, { audience: 'https://your-site.example' });
    if (!s) return res.status(401).json({ ok: false });
    const maxAge = (s.exp ?? 0) - Math.floor(Date.now() / 1000);
    res.setHeader('Set-Cookie', `oc_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
    res.status(200).json({ ok: true });
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

Or set it in code with `requireBond: { minSats: 100_000, minDays: 30, maxAgeSecs: 3600 }`. ochk.io re-checks the coin when its last check is over ten minutes old; `maxAgeSecs` refuses a claim checked longer ago than you accept. From 0.28.0, an account below the floor gets `403 { ok: false, reason: 'bond_required', need: { min_sats, min_days }, have: { sats_floor, days_floor } | null, back_url }`: link the person to `back_url` to back their account. If the project's setting can't be read, the last one read stands for ten minutes; with none read in that time, a signed-in request gets `503 { reason: 'bond_policy_unavailable' }` rather than being let through unchecked. A request with no session is not held to the project's setting and never waits on it (0.37.0); pass `required: true` to answer it 401. `readBondClaim(session)` and `bondMeets(session, { minSats, minDays, maxAgeSecs })` are exported for your own checks.

## Pay your users, when you choose to

Paying the people who use your app is optional. In your project's dashboard you turn it on, schedule promos ("Launch week", Oct 20 to 27), or leave it off. While a pay period runs, each event you send earns the person their share and takes its fee from your balance. Outside every period an event earns and costs nothing, and me.ochk.io records nothing, so you can fire events from code that runs all the time:

```ts
const res = await oc.event.fire({
    project_key: 'pk_live_yourcompany',
    subtype: 'account_creation',
    signingSecret: process.env.OC_SIGNING_SECRET,
    accountId: didOc,
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

See [ochk.app/pricing](https://ochk.app/pricing) for what each kind of event pays and what you never pay for, and [ochk.io/docs/me/sdk](https://ochk.io/docs/me/sdk) for the full SDK reference.

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

These mirror what the me.ochk.io API accepts and returns. A change to the API ships here in the next minor.

## Server-side verification

Verify the OC session on your backend without writing a JWK fetcher, an env-var loader, or a cache. The SDK does that internally.

The adapters and `getOcSession` / `checkOcSession` throw on an option they do not read, so a misspelt `projectKey`, `audience` or bond threshold is never ignored.

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

### Sessions ended everywhere

Set `OC_PROJECT_KEY` and `OC_SIGNING_SECRET` (from ochk.app/me/projects) and `getOcSession`, `withOcAuth`, `ocAuthExpress` and `ocAuthHono` refuse a session the person ended everywhere: sign out everywhere, a passkey removed, the account deleted. A sign-in token carries `rh`, its revocation handle for your origin; they look it up in me.ochk.io's list of ended handles for that origin, read once a minute per origin with a request signed by your secret, so a refusal lands within about two minutes. The handles name nobody, and another site's handles for the same person never match yours. If the list can't be read, or is more than ten minutes old by its own clock, reads go on and writes are refused until it can: the adapters answer such a write `503 { reason: 'revocations_unavailable' }` (0.38.0), not 401, so a client retries instead of signing the person out, and `checkOcSession(headers, options)` tells the same apart for your own code (`signed_in`, `signed_out` or `unavailable`). A token without `rh`, and every token while the two variables are unset, is checked by its signature alone and stays valid until it expires. Needs 0.35.0 or later.

## Keep your own login: OC Connect

A site that keeps its own login (Auth0, Clerk, NextAuth, email and password) makes an orangecheck account for its user from its backend. Your Connect API key is on ochk.app, under your project's **Sign-in → Your own login**. Server only: these refuse to run in a browser, where the key would be exposed.

```ts
import { connectProvision, connectClaimLink, connectDelete } from '@orangecheck/me-client/server';

const r = await connectProvision({ apiKey: process.env.OCHK_CONNECT_KEY!, userId: user.id });
if (r.ok) await saveDid(user.id, r.did_oc); // keep it on your user record
// r.ok === false: r.reason is 'account_deleted', 'daily_limit', 'rate_limited',
// 'invalid_api_key', 'app_suspended', 'bad_request' or 'unavailable'
```

A refusal or an outage is a result, never a throw, so it can't block your own sign-in; a call is given up after `timeoutMs` (5 s, at most 30 s). Only a mistake in the call throws: an option it does not read, a missing key or user id, or `consent: false`.

**With or without asking.** Make the account with no prompt, or show an opt-in box on your sign-in or sign-up with the canonical words, from a module with no dependencies that any UI can use:

```ts
import { CONNECT_CONSENT_LABEL, CONNECT_CONSENT_BLURB } from '@orangecheck/me-client/connect-consent';
```

Show the box unticked, never pre-ticked and never bundled with your Terms. Ticked: `connectProvision({ apiKey, userId, consent: true })`. Unticked: make no call at all. A later tick upgrades an account made without asking. `connectClaimLink` mints a link for your signed-in user to claim their account at ochk.app; `connectDelete` deletes it when they delete their account with you. The full guide is [ochk.io/docs/connect](https://ochk.io/docs/connect). Needs 0.39.0 or later.

## Browser popup signin

```tsx
import { signInWithOc } from '@orangecheck/me-client/popup';

button.addEventListener('click', async () => {
    const result = await signInWithOc();
    if (!result) return; // user cancelled or popup blocked
    // Your server verifies it and keeps it in an httpOnly cookie. Not
    // localStorage: any script on the page could read it there.
    const r = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: result.token }),
    });
    if (r.ok) location.assign('/dashboard');
});
```

`signInWithOc()` MUST be called inside a user-gesture handler (browsers block `window.open` outside of gestures). Returns `{ account, token }` on success, `null` on cancel / popup block / abort.

To tell those apart, `signInWithOcOutcome()` (0.36.0 or later) resolves with a `status`:

```ts
import { signInWithOcOutcome } from '@orangecheck/me-client/popup';

const outcome = await signInWithOcOutcome();
if (outcome.status === 'blocked') showHint('Allow pop-ups for this site, then try again.');
if (outcome.status === 'signed_in') await keepSession(outcome.token);
// 'closed' (the person closed the window), 'aborted' (your signal), 'failed' (not a browser, or a malformed answer)
``` Pins both `event.origin` AND `event.source === popup` on the postMessage handler so a same-origin attacker can't settle the promise.

## Custom origin

For staging, self-hosted me-equivalents, or local dev:

```ts
import { setOrigin } from '@orangecheck/me-client';

setOrigin('https://me.example-staging.com');
```

## License

MIT.
