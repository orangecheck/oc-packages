# ochk.app · Quickstart

Two tracks. **Sign in** is free and stands on its own: five steps, and your app
signs people in and can keep bots out. **Pay your users** is optional, and you
can add it whenever you like: five steps, the last one going live. Nothing here
needs a sales call, and nothing is destructive.

## Sign in (free)

### 1 · create a project

Sign in at [ochk.app](https://ochk.app/me/projects/new) with the account you
already have. Your orangecheck account is your developer account. The new
project asks for your app's name and domain, how people sign in (choose
**orangecheck sign-in**), and when to pay your users. Leave that at **Off**; the
second track turns it on.

```text
name:    Your App
domain:  yourapp.example
→ project key: pk_test_a4f9k2x…
```

A new project starts in test mode, so its key starts `pk_test_`. Put it in your
server's environment as `OC_PROJECT_KEY`. Sign-in itself never needs your domain
verified. You verify it for two things:

- **Refusing sessions people ended everywhere.** The list of ended sessions is
  served only for your verified domain's origins
  ([when someone ends every session](https://ochk.io/docs/me/sdk#when-someone-ends-every-session)).
  Once your server has `OC_PROJECT_KEY` and `OC_SIGNING_SECRET`, verify the
  domain before you deploy: until it is verified the list is refused, and the
  SDKs then refuse writes from signed-in sessions (reads go on). The same holds
  on any host outside the domain, such as a `*.vercel.app` preview: test the
  whole flow on a subdomain of your domain, or on localhost with a test project.
  For localhost, enter `http://localhost:<port>` as the test project's
  development origin first (its **Sign-in** page, under **Local development**,
  or `PATCH /api/me/projects/[id]` with `{ dev_origin }`). Until you do, the
  list for it answers `403 dev_origin_not_declared` and every write from a
  signed-in session `503 revocations_unavailable`
  ([while you build](https://ochk.io/docs/me/sdk#when-someone-ends-every-session)).
- **[Going live](https://ochk.io/docs/me/quickstart#5--go-live) with paying.**

For a project that only signs people in, verifying changes nothing else: no
events, no charges, and sign-in works the same before and after.

### 2 · add the sign-in popup

```bash
npm install @orangecheck/me-client
```

If your own session replaces the token after sign-in, your server also needs
`@orangecheck/auth-core` 2.12.0 or later, for `integratorRevocationCheck`
([how](https://ochk.io/docs/me/sdk#if-your-own-session-replaces-the-token)).

No bundler? `dist/popup.mjs` in the published package is a single ES module with
no imports of its own. Copy it from the version you install to your own origin,
say as `/js/oc-popup.mjs`, import `signInWithOc` from that path in a
`<script type="module">`, and copy it again when you upgrade.

Call [`signInWithOc()`](https://ochk.io/docs/sdk/me-client/popup/functions/signInWithOc) inside a
click handler, or the browser blocks the popup. The person signs in on
orangecheck's page with email, Google, GitHub or a Bitcoin wallet, and the popup
hands your page a token bound to your origin. A page served with
`Cross-Origin-Opener-Policy: same-origin` never gets it back; send
`same-origin-allow-popups`, or no such header. Under a Content Security Policy
the popup needs no orangecheck origin in `connect-src` or `frame-src`: it opens
a window and takes one message from it. Only `script-src` must allow wherever
you serve the module. Post the token to your own server:

```ts
import { signInWithOc } from '@orangecheck/me-client/popup';

document.querySelector('#signin')!.addEventListener('click', async () => {
    const result = await signInWithOc();
    if (!result) return; // closed, blocked, or failed
    const r = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: result.token }),
    });
    if (r.ok) location.assign('/dashboard');
});
```

For the button itself, with the orangecheck mark and in your site's own style,
use [the sign-in button](https://ochk.io/docs/integration/sign-in-button): it opens the same popup.

Your server keeps the token in an httpOnly cookie, out of reach of your page's
scripts:

```ts
// Next.js Pages · pages/api/auth/session.ts
import type { NextApiRequest, NextApiResponse } from 'next';

import { checkOcToken } from '@orangecheck/me-client/server';

export default async function session(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') return res.status(405).end();
    const token = String(req.body?.token ?? '');
    const checked = await checkOcToken(token, {
        audience: 'https://yourapp.example',
    });
    // ochk.io's keys can't be read right now: the page can try again.
    if (checked.status === 'unavailable') {
        return res.status(503).json({ ok: false, reason: checked.reason });
    }
    // 'audience': a genuine token made for another site. Check `audience` above.
    if (checked.status !== 'valid') {
        return res.status(401).json({ ok: false, reason: checked.reason });
    }
    const s = checked.session;
    const maxAge = (s.exp ?? 0) - Math.floor(Date.now() / 1000);
    res.setHeader(
        'Set-Cookie',
        `oc_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
    );
    res.status(200).json({ ok: true });
}
```

On Express or Hono it is the same three moves: check with `checkOcToken`, set
the cookie, answer `ok`. A 503 means ochk.io's keys could not be read, not a bad
token, so the page can try again. A 401 with `reason: 'audience'` (me-client
0.63.0 or later) means the token is genuine but was made for another site: set
`audience` to your site's origin exactly, `https://` and any port included.
`checkOcToken` checks the token, not who can sign in (step 4): the wrapper in
step 3 applies that on every request that reads the cookie. If your own session
replaces the token, run the exchange inside the wrapper instead
([if your own session replaces the token](https://ochk.io/docs/me/sdk#if-your-own-session-replaces-the-token)).
A backend in Python or another language checks the token itself: see
[verify without the SDK](https://ochk.io/docs/me/sdk#verify-without-the-sdk).

The token lasts as long as the person's ochk.io session, 30 days at most, and is
never refreshed: when it expires, they sign in again. To sign someone out, clear
the cookie and [end the token](https://ochk.io/docs/me/sdk#ending-a-session), so orangecheck refuses
it too. Clearing the cookie is what signs them out of your site at once. Signing
out of ochk.io does not sign them out of your site. Once your server has your
project key and signing secret, its list of ended sessions carries each token
ended at your origin and every session someone ended everywhere, and your server
refuses either within about two minutes while it can read that list (see
[when someone ends every session](https://ochk.io/docs/me/sdk#when-someone-ends-every-session)).

`@orangecheck/auth-client` is for orangecheck's own sites; integrators use
me-client. Its `<OcSignIn>` and `<OcSessionProvider>` work only on `*.ochk.io`
and ochk.app, which share orangecheck's session. On your site, use the popup,
and read your own session in React as [React](https://ochk.io/docs/me/sdk#react) shows.

### 3 · check the session on your server

The wrapper, [`withOcAuth`](https://ochk.io/docs/sdk/me-client/server/functions/withOcAuth), reads
the `oc_session` cookie from step 2.

```ts
// Next.js Pages · pages/api/auth/me.ts
import { withOcAuth } from '@orangecheck/me-client/server';

export default withOcAuth(
    async (req, res) => {
        if (!req.ocSession) return res.status(401).json({ ok: false });
        res.status(200).json({
            ok: true,
            account: {
                id: req.ocSession.sub,
                did_oc: req.ocSession.did_oc,
            },
        });
    },
    {
        audience: 'https://yourapp.example',
        projectKey: process.env.OC_PROJECT_KEY!,
    }
);
```

Express:

```ts
import { ocAuthExpress } from '@orangecheck/me-client/server';
import express from 'express';

const app = express();
app.use(
    ocAuthExpress({
        audience: 'https://yourapp.example',
        projectKey: process.env.OC_PROJECT_KEY!,
    })
);

app.get('/api/auth/me', (req, res) => {
    if (!req.ocSession) return res.status(401).json({ ok: false });
    res.json({
        ok: true,
        account: { id: req.ocSession.sub, did_oc: req.ocSession.did_oc },
    });
});
```

Hono, Bun, Deno:

```ts
import type { OcHonoEnv } from '@orangecheck/me-client/server';

import { ocAuthHono } from '@orangecheck/me-client/server';
import { Hono } from 'hono';

const app = new Hono<OcHonoEnv>();
app.use(
    '*',
    ocAuthHono({
        audience: 'https://yourapp.example',
        projectKey: process.env.OC_PROJECT_KEY!,
    })
);

app.get('/api/auth/me', (c) => {
    const session = c.get('ocSession');
    if (!session) return c.json({ ok: false }, 401);
    return c.json({
        ok: true,
        account: { id: session.sub, did_oc: session.did_oc },
    });
});
```

`audience` is the origin of the page that opened the popup, exactly: your site's
origin, or `http://localhost:5173` while you develop, never your API's origin. A
token issued to any other origin is refused. `projectKey` makes the wrapper
enforce who can sign in (step 4) from your project's settings; a key that names
no project answers `500 unknown_project_key`. The wrapper fetches and caches
orangecheck's keys itself, so there are no JWKs to handle. `did_oc` is the
person's account id, the same in every app.

### 4 · choose who can sign in

On your project's **Sign-in** tab, under **Who can sign in**:

| Choice                 | Who gets in                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| **Everyone** (default) | every orangecheck account                                                |
| **Backed by bitcoin**  | accounts backed by one coin of **at least N sats, held at least D days** |

The coin stays in the person's wallet, and you never see it. A change is read by
your server within a minute. If it can't read the rule, the last one read stands
for up to ten minutes, and after that signed-in requests are refused until it
can. An account below the bar gets `403 bond_required` with a `back_url`, where
the person can back their account. Details, and how to keep one account per
coin: [Who can sign in](https://ochk.io/docs/me/require-bond).

That is sign-in. It costs nothing, in test mode or live.

### 5 · check it before real people sign in

Each line is a way an integration has gone wrong, with why it matters.

**The token**

- [ ] No script ever holds it: not in `localStorage`, not in `sessionStorage`.
      _Any script on the page could read it._
- [ ] Your server verifies it with your exact origin as `audience`. _A token
      made for another site must not sign anyone in here._
- [ ] If your site has its own sessions (yours, or a provider's such as Supabase
      or Auth0), the token is spent once and never stored: your session takes
      over. Otherwise keep it in an httpOnly cookie, as in step 2. _A stored
      token is a 30-day credential you didn't need to keep._ When your session
      takes over:
    - [ ] the token's `jti` is spent in a store all your servers share, until
          `exp` (`spendOnce` / `spend_once`). _A token replayed to another
          instance must not sign in twice._
    - [ ] its `rh`, `aud` and `iat` go with your session on the server, before
          you hand the session out, never in a second call from the browser.
          _The browser could bind another token's handle, or none._
    - [ ] the exchange applies who can sign in (inside `withOcAuth`, or with the
          rule read as [who can sign in](https://ochk.io/docs/me/require-bond) says) and waits while
          the list of ended sessions can't be read. _`verifyOcToken` alone lets
          in an account below your floor._
    - [ ] the token is ended right after the exchange. _You don't keep it, so
          sign-out can't end it later._
    - [ ] each later check of that session asks the list with its `rh`, `aud`
          and `iat` only, never the `jti`. _Ending the token put its `jti` on
          your list, so a check that names it ends your own session._

**Ending sessions**
([when someone ends every session](https://ochk.io/docs/me/sdk#when-someone-ends-every-session))

- [ ] Signing out clears your session and, where the token is your session,
      [ends the token](https://ochk.io/docs/me/sdk#ending-a-session). _Otherwise orangecheck goes on
      accepting the token until it expires; once ended, your own server refuses
      it within about two minutes too, while it can read the list._
- [ ] Your server has `OC_PROJECT_KEY` and `OC_SIGNING_SECRET`, refuses to start
      without either, and your domain is verified. _Without them, "sign out
      everywhere" never reaches your site._
- [ ] A session someone ended everywhere is refused within about two minutes
      while your server can read the list, and a token without `rh` is refused:
      me-client 0.40.0 and `orangecheck` 3.0.0 do this unless you pass
      `requireHandle: false` (`require_handle=False`). _Nothing could ever end
      it._
- [ ] Anything you mint while someone is signed in (your session, a provider
      session, API keys, OAuth grants, refresh tokens) ends when their session
      ends everywhere. _Otherwise sign-out ends the cookie and leaves a key
      working._
- [ ] While the list can't be read, writes wait for those grants and tokens too,
      not only for web sessions; reads go on. If your own table of handles
      breaks, only orangecheck sessions are affected. _A failure on our side or
      yours must not lock out your other logins, or let ended sessions write._

**Your own accounts** ([your own accounts](https://ochk.io/docs/me/sdk#your-own-accounts))

- [ ] A first sign-in creates a new user with a random id and a row keyed by
      `did_oc`; nothing finds a user by an identifier derived from the did.
      _Anyone can compute it from the did and register that account first._
- [ ] Outsiders can't pre-register the address or username a first sign-in
      creates in your identity provider: public signup is off, or users are
      created only through an admin API that refuses an existing one. A provider
      session minted for anyone but the expected user is refused. _Otherwise the
      first sign-in walks into an account someone prepared._
- [ ] A first sign-in that loses a race leaves no orphan account. _A stray user
      with no did is an account nobody can reach or clean up._
- [ ] One did per account, enforced by the database. _Code checks race; a unique
      key doesn't._

**Linking and unlinking** ([linking](https://ochk.io/docs/me/sdk#your-own-accounts))

- [ ] Link and unlink each ask for a sign-in with your own login from the last
      five minutes, never one the did itself started, on accounts that have
      their own login. _A stolen orangecheck session must not attach or detach
      itself._
- [ ] A did another user already has is refused. _One person, one account._
- [ ] The account's own email address is told on link and unlink. _The owner
      learns of a change they didn't make._
- [ ] Unlink ends the sessions the unlinked did started, and the grants it
      approved. _Otherwise unlinking leaves it signed in._
- [ ] The account page shows the link, with an unlink button. _People can see
      and undo it._

## Pay your users (optional)

### 1 · when you pay

On your project's **Paying** tab, under **Pay your users**: **Off** (the
default), **Always**, or **Promos**, each a named stretch with a start and an
end. Outside a pay period an event earns nothing, costs nothing and leaves no
record, so on a live project sending events from code that runs all the time is
safe. A test project is stricter: it records events only for you, its owner. An
event for anyone else throws `MeClientError` with `status` 403 and `errorCode`
`earner_not_project_owner`, paying or not, and records nothing, so try events
signed in as yourself, or catch that error, until you go live. Details:
[Paying your users](https://ochk.io/docs/me/paying-users).

### 2 · what each event earns

For each event, set what your user earns: a fixed number of sats, or a share of
a payment. You pay that plus the fee: 20% of the price, rounded to a whole sat
and at least 1 sat, so your user gets about 80%. Earns 100, you pay 125. The
smallest earning is 1 sat, and you pay 2. The **Paying** tab shows the exact
price for each earning you set.

| Event                   | Group       | Your user earns     | You pay             |
| ----------------------- | ----------- | ------------------- | ------------------- |
| `account_creation`      | One-time    | 800 sats            | 1,000 sats          |
| `payment_authorization` | Per action  | 0.4% of the payment | 0.5% of the payment |
| `session_creation`      | Per session | 40 sats             | 50 sats             |

Add your own events too, on the **Paying** tab under "What each event earns":
**Add your own event** takes a key (`lesson_completed`, say: up to 64 letters,
digits and `_ . : -`), the name ochk.app lists it under where people find apps
that pay (up to 80 characters, none of orangecheck's own names), how often it
pays, and what your user earns. Nothing is kept until you press Save. An event
your project doesn't have is refused `event_not_enabled`, whether or not you are
paying yet. To name what happened on each person's activity, send `action_label`
with the event (step 3). Try numbers first in the
[sandbox](https://ochk.app/integrate/sandbox). In the config
(`IntegratorPriceConfig`) a price is `site_pays`, and your user earns
`user_share_pct` of it, which is `0.8`. A config sent with a lower share is
saved at `0.8`, with the lower price that earns your user the same, unless that
price is outside the platform's price bounds (`422 config_invalid`).

### 3 · send events from your server

```ts
import { oc } from '@orangecheck/me-client';

declare const didOc: string; // who earns: req.ocSession.did_oc from step 3 of sign-in

const res = await oc.event.fire({
    project_key: process.env.OC_PROJECT_KEY!,
    subtype: 'account_creation',
    signingSecret: process.env.OC_SIGNING_SECRET,
    accountId: didOc,
});
if (!res.earned) {
    // res.reason 'not_paying': not paying now, so no event was recorded or charged.
    // 'not_billed': recorded and charged nothing, as a test project's is.
}
```

Your own events, and per-action ones, take `action_label`: up to 280 characters
of plain text naming what happened ("Connected Claude to their Studio"). It is
signed into the receipt, and the person sees it on their activity and the
receipt's page; without one, they see orangecheck's name for a built-in event,
or your own event's key.

Send from your backend, never the browser. The signing secret, on your project's
**Keys & webhooks** tab, proves the call comes from your project; showing or
replacing it asks you to confirm it's you. From Python, or without the SDK, see
[signing an event](https://ochk.io/docs/me/api#signing-an-event). Every event a live project is
billed for gets a receipt anyone can check offline: its signature against
orangecheck's published key, and, once a calendar commits it, an OpenTimestamps
proof against Bitcoin. [An example receipt](https://ochk.app/verify/example)
shows the signature check; it records no real event, so it has no timestamp.

### 4 · send a test event

On your project, **Send a test event** sends a sample event under your project
key through the same pipeline as a real one. It is stored with your project's
events, delivered to your [webhooks](https://ochk.io/docs/me/webhooks), and gets a receipt you can
open. It records whether or not you are paying now. Nobody is paid.

### 5 · go live

Live mode needs three things, and your project shows each one:

```text
✓ domain verified
✓ balance funded
· settlement open
```

Paying is in testing: settlement is not open for any project yet, so no real
sats move. Until it opens, no event is signed or timestamped: orangecheck signs
and timestamps only an event that paid, and never a test event. Your project's
page shows when that changes.

To verify your domain, add either record, then check it from your project:

```text
# DNS TXT at yourapp.example (apex)
oc-verify=<token>

# OR a meta tag in <head> at https://yourapp.example/
<meta name="oc-domain-verify" content="<token>" />
```

The check reads the HTML your server sends for `https://yourapp.example/`. A
single-page app must put the tag in its static `index.html`: one added by
JavaScript after load is never seen.

## See it working

[Run the whole funnel yourself](https://ochk.io/docs/integration/reference): open example sites in
Node and Python that follow this page, with tests for each item on the
checklist. They run offline with no account.

[me-demo.ochk.io](https://me-demo.ochk.io) is an integration we built ourselves:
a fictional newsletter site (Lumen Notes), styled deliberately unlike
orangecheck. Its sign-in button is the `signInWithOc()` popup from step 2. It
runs on an `ochk.io` subdomain, so it gets orangecheck's own session rather than
a token bound to its origin, and it sends no events: your site's path is the one
on this page.

## Next

- [SDK reference](https://ochk.io/docs/me/sdk): every export, with types
- [Integrations](https://ochk.io/docs/me/integrations): the sign-in button beside your other
  providers, example prices, errors
- [Webhooks](https://ochk.io/docs/me/webhooks): receiving events, delivery and retries
- [HTTP API](https://ochk.io/docs/me/api): every `me.ochk.io/api/*` endpoint
- [Glossary](https://ochk.io/docs/me/glossary): the words the product uses
