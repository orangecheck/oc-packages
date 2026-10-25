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

// The "Sign in with orangecheck" button, in your site's own style.
import { enhanceSignInButton } from '@orangecheck/me-client/button'; // any page
import { SignInWithOrangecheck } from '@orangecheck/me-client/react'; // React

// Keep your own login: make an orangecheck account for your user (OC Connect).
import { connectProvision } from '@orangecheck/me-client/server';
import { CONNECT_CONSENT_LABEL } from '@orangecheck/me-client/connect-consent';

// After a sign-in: the token starts one session, then ends at ochk.io.
import { spendOnce, revokeToken } from '@orangecheck/me-client/server';
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

Or set it in code with `requireBond: { minSats: 100_000, minDays: 30, maxAgeSecs: 3600 }`. ochk.io re-checks the coin when its last check is over ten minutes old; `maxAgeSecs` refuses a claim checked longer ago than you accept. Each value is left out or a whole number of 0 or more; anything else (NaN from an unset env var, a string, a fraction) throws when the adapter is made. From 0.28.0, an account below the floor gets `403 { ok: false, reason: 'bond_required', need: { min_sats, min_days }, have: { sats_floor, days_floor } | null, back_url }`: link the person to `back_url` to back their account. If the project's setting can't be read, the last one read stands for ten minutes; with none read in that time, a signed-in request gets `503 { reason: 'bond_policy_unavailable' }` rather than being let through unchecked. A request with no session is not held to the project's setting and never waits on it (0.37.0); pass `required: true` to answer it 401. `readBondClaim(session)` and `bondMeets(session, { minSats, minDays, maxAgeSecs })` are exported for your own checks.

`verifyOcToken` and `checkOcToken` check the token alone, not the rule. Where you verify it yourself, apply the rule with one call in the route that starts your own session (0.43.0). It reads and holds the rule as `withOcAuth` does and answers with the same status and body:

```ts
import { checkSignInRule, verifyOcToken } from '@orangecheck/me-client/server';

const session = await verifyOcToken(token, { audience: 'https://your-site.example' });
if (!session) return res.status(401).json({ ok: false });
const checked = await checkSignInRule(session, { projectKey: process.env.OC_PROJECT_KEY! });
if (!checked.ok) return res.status(checked.status).json(checked.body);
```

It takes only the session object `verifyOcToken`, `checkOcToken`, `getOcSession` or an adapter returned, and throws for anything else: claims read back from your own session store, or a copy, could name anyone. A floor with `maxAgeSecs` refuses a backing checked too long ago, so apply it where your session starts, not later.

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

A *.ochk.io site that reads the family cookie (no `audience`) sees family sessions, which ochk.io ends on its own feed. Set `OC_REVOCATION_FEED_TOKEN` (the site's feed token from ochk.io) and the helpers check every family session against it, once a minute per process; while the feed can't be read, reads go on and writes answer 503. With it unset, a family session makes them throw rather than accept it by signature alone (0.44.0); `revocation: false` reads it by signature alone on purpose. The feed is read from `OC_AUTH_ISSUER` (default https://ochk.io), so set it too if you verify another issuer.

Set `OC_PROJECT_KEY` and `OC_SIGNING_SECRET` (from ochk.app/me/projects) and `getOcSession`, `withOcAuth`, `ocAuthExpress` and `ocAuthHono` refuse a session the person ended everywhere: sign out everywhere, a passkey removed, the account deleted. A sign-in token carries `rh`, its revocation handle for your origin; they look it up in me.ochk.io's list of ended handles for that origin, read once a minute per origin with a request signed by your secret, so a refusal lands within about two minutes. The handles name nobody, and another site's handles for the same person never match yours. If the list can't be read, or is more than ten minutes old by its own clock, reads go on and writes are refused until it can: the adapters answer such a write `503 { reason: 'revocations_unavailable' }` (0.38.0), not 401, so a client retries instead of signing the person out, and `checkOcSession(headers, options)` tells the same apart for your own code (`signed_in`, `signed_out` or `unavailable`). Every token while the two variables are unset is checked by its signature alone and stays valid until it expires. A token bound to your site without `rh` is refused (`no_session_handle`, 0.40.0 or later), since sign out everywhere can't reach it; every token from the sign-in popup carries one, and `requireHandle: false` accepts one minted some other way. Needs 0.35.0 or later.

### Sign in from an app on the person's device

A desktop build or a game can't open the popup, and must not carry a secret. It signs the person in through their browser instead (0.50.0, test projects only for now): the app listens on `127.0.0.1`, opens ochk.io's `/native/authorize` with a PKCE challenge, and its listener receives a one-time `code`. The app hands the code, its verifier and its redirect to your server, which trades them:

```ts
import { exchangeNativeCode, spendOnce } from '@orangecheck/me-client/server';

const out = await exchangeNativeCode(
    {
        code,
        codeVerifier,
        redirectUri, // exactly as the app sent it: http://127.0.0.1:<port>/<path>
        audience: 'https://your-site.example', // your verified domain, or your test project's dev origin
    },
    { projectKey: process.env.OC_PROJECT_KEY } // your own key, from your config, never from the request
);
if (out.status === 'valid' && (await spendOnce(out.session.jti, out.session.exp ?? 0, store))) {
    // Start your session for out.session.did_oc.
}
```

Start a session only from `valid`. It means what a request through `withOcAuth` means: the token is the popup's, verified for your `audience`, with `azp: "native"`; the person has not ended it everywhere; and the account meets your project's "who can sign in" rule. The key decides whose rule and list of ended sessions apply, so it comes from your config (`projectKey`, default `OC_PROJECT_KEY`), and a `projectKey` in the input throws. The list of ended sessions is read with your project key and `OC_SIGNING_SECRET`, as the adapters read it, or pass `revocation`; the trade counts as a write, so a list that can't be read answers `unavailable`.

`invalid` names why: `invalid_grant` (start again), `session_ended`, or `bond_required` with `need`, `have` and `back_url`, as the adapters' 403 carries them. `unavailable` is an outage (`revocations_unavailable` and `bond_policy_unavailable` among them), so answer it 503. Each code works once, whatever the answer. Turn native sign-in on for a test project on ochk.app; the app's half, with a Godot example, is at ochk.io/docs/integration/native-sign-in.

## Keep your own login: OC Connect

A site that keeps its own login (Auth0, Clerk, NextAuth, email and password) makes an orangecheck account for its user from its backend. Your Connect API key is on ochk.app, under your project's **Sign-in → Your own login**. Server only: import these only from code that never reaches a client bundle. They refuse to run where there is a `document`, which catches the commonest slip but is not a guard (a browser Web Worker has none).

```ts
import { connectProvision, connectClaimLink, connectDelete } from '@orangecheck/me-client/server';

const r = await connectProvision({ apiKey: process.env.OCHK_CONNECT_KEY!, userId: user.id });
if (r.ok) await saveDid(user.id, r.did_oc); // keep it on your user record
// r.ok === false: r.reason is 'account_deleted', 'daily_limit', 'rate_limited',
// 'invalid_api_key', 'app_suspended', 'bad_request' or 'unavailable'
```

A refusal or an outage is a result, never a throw, so it can't block your own sign-in; a call is given up after `timeoutMs` (5 s, at most 30 s). Every call goes to `https://ochk.io` and nowhere else, and a redirect is an error. Only a mistake in the call throws: an option it does not read, a missing key or user id, or `consent: false`. Only your options object's own keys are read, once, so nothing inherited (a polluted `Object.prototype`) can tick consent.

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

## The sign-in button

Your button, your style: the package adds the orangecheck mark (from
[`@orangecheck/mark`](https://www.npmjs.com/package/@orangecheck/mark)), an
approved label, the popup inside the click, and the busy state. Rules and live
examples: [ochk.io/docs/integration/sign-in-button](https://ochk.io/docs/integration/sign-in-button).

```html
<button class="your-button" data-oc-sign-in><span data-oc-mark></span>Sign in with orangecheck</button>
<script type="module">
    import { enhanceSignInButton, OUTCOME_COPY } from '/vendor/oc-sign-in.mjs'; // dist/button.mjs, copied
    enhanceSignInButton(document.querySelector('[data-oc-sign-in]'), {
        onSignedIn: async ({ token }) => {
            const r = await fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
            if (r.ok) location.assign('/dashboard');
        },
        onOutcome: (o) => { if (o.status !== 'signed_in' && o.status !== 'aborted') showNote(OUTCOME_COPY[o.status]); },
    });
</script>
```

The `<span data-oc-mark>` holds the mark's place, so drawing it moves nothing.

From a CDN, load `dist/button-auto.mjs` by a tag instead, with the exact
version and its Subresource Integrity hash, so the browser refuses any other
bytes. It enhances every `[data-oc-sign-in]` button and reports through
events, so your own script imports nothing:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@orangecheck/me-client@0.48.0/dist/button.css"
      integrity="sha384-…" crossorigin="anonymous" />
<button class="your-button" data-oc-sign-in><span data-oc-mark></span>Sign in with orangecheck</button>
<script type="module" src="https://cdn.jsdelivr.net/npm/@orangecheck/me-client@0.48.0/dist/button-auto.mjs"
        integrity="sha384-…" crossorigin="anonymous"></script>
<script>
    document.addEventListener('oc-signed-in', (e) => e.detail.waitUntil(keepSession(e.detail.token)));
    document.addEventListener('oc-sign-in-outcome', (e) => showNote(e.detail.message));
</script>
```

Both events come from the button and bubble. Any script on the page can fire
them too, so send only the token to your server and never trust `account` from
the event in the browser: your server's check (`withOcAuth`, `checkOcToken`)
is the only answer.

Take the two hashes from the files in the published package
(`openssl dgst -sha384 -binary dist/button-auto.mjs | openssl base64 -A`), or
copy them from your project's snippet on ochk.app. Under a strict
Content-Security-Policy, serve both files from your own origin instead.

```tsx
import { SignInWithOrangecheck } from '@orangecheck/me-client/react';
import '@orangecheck/me-client/button.css'; // optional: the mark's size, one line, a 44px target

<SignInWithOrangecheck className="btn btn-outline" onSignedIn={({ token }) => keepSession(token)} />;
```

- `appearance`: `inherit` (default) sets no colour, font, border, radius or
  focus ring; your class draws it, your ring shows. `brand` is orangecheck's
  ink button, themed by `--oc-button-bg`, `-fg`, `-border`, `-radius`, `-font`,
  `-size`, `-weight`, `-pad`, `-hover-bg` and `--oc-focus`.
- `mark`: `mono` (default, your text colour), `brand` (dark buttons), `tile`
  (any button), or `false`.
- `label`: "Sign in with orangecheck" by default, or "Continue with
  orangecheck", "Sign up with orangecheck" (`SIGN_IN_LABELS`), or the same in
  your language, as long as it keeps "orangecheck", lowercase, as written.
  Words without it throw. `busyLabel` is what it says while the window is open
  ("Signing in…" by default). `label: false` draws the mark alone, named by
  `accessibleLabel` for screen readers.
- While the window is open the button is `aria-busy` and `aria-disabled`, still
  focusable, keeps its width, and opens no second window.
- `button.css` is optional and has zero specificity: every rule of yours wins.
  It keeps the words on one line, sizes the mark before it paints (1.75em),
  gives a 44px target, and draws the mark flat in your text colour when the
  system forces colours. Tune it with `--oc-mark-gap` and `--oc-mark-size`.
  `--oc-target` lowers the 44px minimum; 44px is the rule, so keep it unless
  your own buttons already give a 44px target.
- `dist/button.mjs` has no imports, so it can be served from your own origin
  under `script-src 'self'`. It builds the mark node by node: no `innerHTML`, so
  Trusted Types are fine too.

## Custom origin

For staging, self-hosted me-equivalents, or local dev:

```ts
import { setOrigin } from '@orangecheck/me-client';

setOrigin('https://me.example-staging.com');
```

The Connect calls in `/server` don't use it: a call that carries your Connect API key goes to `https://ochk.io` and nowhere else.

## License

MIT.
