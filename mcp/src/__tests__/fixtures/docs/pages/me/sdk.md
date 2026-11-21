# `@orangecheck/me-client` · SDK reference

> **Full reference:** [ochk.io/docs/sdk/me-client](https://ochk.io/docs/sdk/me-client/README), with
> its own index for [`/server`](https://ochk.io/docs/sdk/me-client/server/README) and
> [`/popup`](https://ochk.io/docs/sdk/me-client/popup/README), generated from the TypeScript source
> on every release. This page is the curated overview; the generated reference
> is the source of truth for every export, type and signature.

**MIT.** One package for signing people in with orangecheck and, if you choose,
paying them. Its entry points:

- **`@orangecheck/me-client`**: the `oc.*` namespaces (event, webhook, config,
  scope, session, payment, identity) and every type. No React, so a Node backend
  imports it as it is.
- **`@orangecheck/me-client/server`**: checks the session on your server.
  [`withOcAuth`](https://ochk.io/docs/sdk/me-client/server/functions/withOcAuth) (Next.js Pages),
  [`ocAuthExpress`](https://ochk.io/docs/sdk/me-client/server/functions/ocAuthExpress),
  [`ocAuthHono`](https://ochk.io/docs/sdk/me-client/server/functions/ocAuthHono),
  [`getOcSession(headers)`](https://ochk.io/docs/sdk/me-client/server/functions/getOcSession),
  [`checkOcToken(token)`](https://ochk.io/docs/sdk/me-client/server/functions/checkOcToken),
  [`verifyOcToken(token)`](https://ochk.io/docs/sdk/me-client/server/functions/verifyOcToken). You
  never fetch or handle a JWK: the SDK does that and caches it. A backend in
  Python or any other language checks the token itself: see
  [verify without the SDK](https://ochk.io/docs/me/sdk#verify-without-the-sdk).
- **`@orangecheck/me-client/popup`**: browser only.
  [`signInWithOc()`](https://ochk.io/docs/sdk/me-client/popup/functions/signInWithOc) opens the
  orangecheck sign-in popup and resolves with a token bound to your origin, the
  way Google's and GitHub's popups do.
- **The rest:** `/react`, `/button`, `/button-auto` and `button.css` are
  [the sign-in button](https://ochk.io/docs/integration/sign-in-button); `/connect-consent` holds
  the words for the [Connect](https://ochk.io/docs/connect) opt-in box; `/integrator` holds the
  price config helpers, with no DOM, for scripts and CI.

## install

```bash
npm install @orangecheck/me-client
```

That is all sign-in needs, in a React app too ([React](https://ochk.io/docs/me/sdk#react) below), unless
your own session replaces the token: then your server also needs
`@orangecheck/auth-core` 2.12.0 or later, for `integratorRevocationCheck`
([how](https://ochk.io/docs/me/sdk#if-your-own-session-replaces-the-token)). `@orangecheck/auth-client` is
for orangecheck's own sites; integrators use me-client.

Bundling your server: `@orangecheck/me-client/server` imports only
`@orangecheck/auth-core` at run time, which brings `jose`. `express` and `hono`
are optional peers it never imports, so a bundle needs neither.

**Testing your server without ochk.io.** Every server helper calls
`globalThis.fetch` when it runs, so a stub installed there sees each request:
ochk.io's key set (`/.well-known/jwks.json`), the project's sign-in rule and the
list of ended sessions on me.ochk.io, the native code's exchange, `revokeToken`
and the Connect calls. None takes a `fetch` of its own;
`integratorRevocationCheck` does, and the wrappers take that check as their
`revocation` option. The key set is held for an hour and the rule for a minute,
so install the stub before the first call.

## sign-in in the browser

```ts
import { signInWithOc } from '@orangecheck/me-client/popup';

declare const button: HTMLButtonElement; // your "Sign in with orangecheck" button

button.addEventListener('click', async () => {
    const result = await signInWithOc();
    if (!result) return; // closed, blocked, aborted, or failed
    const r = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: result.token }),
    });
    if (r.ok) location.assign('/dashboard');
});
```

Call `signInWithOc()` inside a user gesture: browsers block `window.open`
anywhere else. It resolves to `{ account, token }`, or `null` when the person
closes the popup, the browser blocks it, your `signal` aborts, or it fails (not
in a browser, or the popup's answer was malformed). Trust only the token;
`account` is unsigned.

To tell a blocked window from a closed one, use `signInWithOcOutcome()`
(me-client 0.36.0 or later), which takes the same options and resolves with a
`status`:

| `status`    | Means                                                                                  |
| ----------- | -------------------------------------------------------------------------------------- |
| `signed_in` | Signed in; `account` and `token` as from `signInWithOc`.                               |
| `blocked`   | The browser refused to open the window. Ask to allow pop-ups, then retry from a click. |
| `closed`    | The person closed the window without signing in.                                       |
| `aborted`   | Your `signal` fired.                                                                   |
| `failed`    | Not in a browser, or the popup's answer was malformed.                                 |

```ts
import { signInWithOcOutcome } from '@orangecheck/me-client/popup';

declare function showHint(text: string): void;
declare function keepSession(token: string): Promise<void>; // post it to your session route

const outcome = await signInWithOcOutcome();
if (outcome.status === 'blocked')
    showHint('Allow pop-ups for this site, then try again.');
if (outcome.status === 'signed_in') await keepSession(outcome.token);
```

Both take
[`SignInWithOcOptions`](https://ochk.io/docs/sdk/me-client/popup/interfaces/SignInWithOcOptions):
`{ signal, popupOrigin, popupPath, features }`. `popupOrigin` (default
`https://me.ochk.io`) and `popupPath` (default `/popup/signin`) point the popup
somewhere else, such as a stand-in of your own while you test
([what a stand-in must do](https://ochk.io/docs/me/sdk#a-stand-in-sign-in-window)); the answer is accepted
only from exactly `popupOrigin`, so give it with no trailing slash. `features`
is the `window.open` feature string.

**Without a bundler.** `dist/popup.mjs` has no imports of its own. Fetch it with
`npm pack @orangecheck/me-client@<version>`, serve `package/dist/popup.mjs` from
your own origin, and import it in a `<script type="module">`. Copy it again when
you upgrade.

### a stand-in sign-in window

While you test, you can point `popupOrigin` and `popupPath` at a window of your
own instead of orangecheck's. The
[examples' offline mode](https://ochk.io/docs/integration/reference#run-it-with-no-account) runs
one. This is what the SDK needs from it, as of me-client 0.63.0. orangecheck's
window does the same, plus the opener check below.

**How it opens.** The SDK opens `popupPath` on `popupOrigin` with one query
parameter, `opener_origin`: the origin of the page that called it, such as
`http://localhost:3000`. The window is named `oc-signin`.

**What it posts.** One message to `window.opener`, with `opener_origin` as the
target origin, never `'*'`:

```ts
declare const openerOrigin: string; // the opener_origin parameter, once you have checked it
declare const token: string; // a JWT your stand-in signed, below
declare const didOc: string; // did:oc: and 32 hex digits

window.opener.postMessage(
    {
        type: 'oc-signin-success',
        account: {
            id: 'test-1',
            did_oc: didOc,
            display_name: null,
            nostr_npub: null,
        },
        token,
    },
    openerOrigin
);
```

orangecheck's window sends `account` as
`{ id, did_oc, display_name, nostr_npub }`. For a site outside orangecheck, the
last two are always `null`. The SDK checks only that `account` and `token` are
there. `account` is unsigned: trust only the token.

**What the SDK checks.** A message counts only if its origin is exactly
`popupOrigin` and it comes from the window the SDK opened. Apart from the opener
check below, it ignores any other `type`. An `oc-signin-success` without
`account` or `token` ends as `failed`. The SDK closes the window when it is
done.

**No failure or cancel message.** Neither window sends one. The SDK checks every
half second whether the window has closed, and then ends as `closed`
(`signInWithOc` returns `null`). orangecheck's window shows its own errors and
waits for the person to close it.

**The opener check.** orangecheck's window first posts
`{ type: 'oc-signin-challenge', nonce }` to the opener. The SDK (0.59.0 or
later) posts `{ type: 'oc-signin-echo', nonce }` back to the window. That proves
the page is really at `opener_origin`. A stand-in can skip it.

**The token.** In a local test your server accepts a token your stand-in signs,
shaped like ochk.io's ([its claims](https://ochk.io/docs/me/sdk#verify-without-the-sdk)):

- An EdDSA (Ed25519) JWT. Its header's `kid` names a key in
  `<issuer>/.well-known/jwks.json`.
- `iss` is that issuer: https, or http on localhost only.
- `aud` is `opener_origin`, exactly.
- `sub`, `did_oc`, `jti`, `rh`, `iat` and `exp` are set. A token without `rh` is
  refused (`no_session_handle`).

Name your stand-in as the issuer, and the SDK reads its keys from there:

```ts
// In a local test only: your stand-in is the issuer.
import { checkOcToken } from '@orangecheck/me-client/server';

declare const token: string; // what your page posted

const checked = await checkOcToken(token, {
    audience: 'http://localhost:3000',
    issuer: 'http://localhost:3000/stand-in',
});
```

`withOcAuth` and the other wrappers take the same `issuer`. Give them
`revocation: false` too: the list of ended sessions is on me.ochk.io, which has
never seen these tokens. Leave out `projectKey`, which reads your project's rule
from me.ochk.io. Use these options only in tests.

### a Bitcoin wallet in the popup

The popup offers a Bitcoin wallet beside email, Google and GitHub. Your page
gets the same token whichever the person picks, bound to your origin, and never
the address.

- **With a browser wallet** (UniSat, Xverse, Leather), the popup asks the wallet
  to sign.
- **Without one** (a phone, Sparrow, a hardware wallet), the popup shows the
  message; the person signs it in any wallet and pastes the signature back.

Any address the verifier accepts can sign in: a BIP-322 simple signature from a
`bc1q…`, `bc1p…` or `3…` address, or a legacy `signmessage` signature from those
or a `1…` address. The full table is in
[what the verifier accepts](https://ochk.io/docs/ecosystem/bip322#what-the-verifier-accepts).

The message the popup shows. Every line ends in a newline, the last one
included:

```text
orangecheck-auth
address: bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4
nonce: 7b021c61b7bfa698dbf2c562900c8aad
issued_at: 2026-10-22T18:04:11Z
expires_at: 2026-10-22T18:09:11Z
ack: I authorize this session under the OrangeCheck auth challenge.
audience: https://me.ochk.io
purpose: login
```

| Line                                             | What varies                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `orangecheck-auth`, `ack`, `audience`, `purpose` | Nothing. `audience` is the popup's own origin, `https://me.ochk.io`, never yours: the signature signs the person in to orangecheck, and your page still gets a token for its origin. |
| `address`                                        | The address the person entered.                                                                                                                                                      |
| `nonce`                                          | 32 hex digits, new for every message, accepted once.                                                                                                                                 |
| `issued_at`, `expires_at`                        | UTC to the second, five minutes apart. A signature that arrives after `expires_at` is refused; the person starts again for a new message.                                            |

The wallet must sign these bytes exactly. A wallet, or a copy and paste, that
drops the final newline makes a signature that fails.

To test with a throwaway key instead of a wallet, sign the message the popup
shows with [`@orangecheck/bip322`](https://ochk.io/docs/sdk/bip322/README):

```ts
import { randomBytes } from 'node:crypto';

import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';

declare const message: string; // the popup's text, exactly

const key = randomBytes(32); // never a key that holds coins
const address = addressFromPrivateKey(key, 'p2wpkh'); // enter this in the popup
const signature = signMessage(address, message, key);
```

Each new key signs in as a new orangecheck account.

**Driving the popup in a test.** In a browser with no wallet extension, the
popup's controls are, in order: the **Bitcoin wallet** tab, the **Bitcoin
address** field, the **Get the message to sign** button, the read-only **Message
to sign** box (the text above), the **Signature** box, and **Sign me in**. Find
them by those labels (a tab, a labelled field, buttons by name). With a wallet
extension the button reads **Sign in with wallet** instead.

## the session cookie

Post the token to a route of your own that verifies it and keeps it in an
httpOnly cookie. Every route after that reads the cookie, so no script keeps the
token and nothing sends a Bearer header.

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

## checking the session on your server

`withOcAuth` for Next.js Pages Router:

```ts
// pages/api/auth/me.ts
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

`ocAuthExpress` for Express:

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

app.get('/api/profile', (req, res) => {
    if (!req.ocSession) return res.status(401).json({ error: 'sign in' });
    res.json({ did_oc: req.ocSession.did_oc });
});
```

`ocAuthHono` for Hono, Bun and Deno:

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

app.get('/api/profile', (c) => {
    const session = c.get('ocSession');
    if (!session) return c.json({ ok: false }, 401);
    return c.json({ did_oc: session.did_oc });
});
```

`getOcSession(headers)` is the framework-agnostic primitive. It takes a Web
`Headers` object or a plain `{ cookie, authorization }` object, reads the
`oc_session` cookie (or, failing that, a Bearer token), and returns the verified
`SessionPayload` or `null`.

The wrappers all take one options bag,
[`WithOcAuthOptions`](https://ochk.io/docs/sdk/me-client/server/interfaces/WithOcAuthOptions):

| Option        | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audience`    | Your own origin. A token issued to any other site is refused. Leave it out only on a `*.ochk.io` site that reads the family cookie.                                                                                                                                                                                                                                                                                                                                          |
| `projectKey`  | Enforces [who can sign in](https://ochk.io/docs/me/require-bond) as set on your project: everyone, or only accounts backed by bitcoin. A key that names no project gets `500 unknown_project_key`. While it can't be read, the last one read stands for ten minutes, then a signed-in request gets `503 bond_policy_unavailable`. A request with no session is not held to it and never waits on reading it (me-client 0.37.0): set `required: true` if a route must refuse signed-out requests. |
| `meOrigin`    | Where the project's rule and its list of ended sessions are read. Default `https://me.ochk.io`.                                                                                                                                                                                                                                                                                                                                                                              |
| `required`    | `true` answers `401` before your handler runs when nobody is signed in.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `requireBond` | `{ minSats, minDays, maxAgeSecs }` in code, each a whole number of 0 or more. Wins over `projectKey`. Unlike the project's rule, it also refuses a request with no session: `401 unauthenticated`.                                                                                                                                                                                                                                                                           |

**Python** ([`orangecheck`](https://ochk.io/docs/sdk/python) 2.9.0 or later) does the same with
`verify_session`:

```python
import os

from orangecheck import BondRequired, InvalidSession, RevocationList, SignInPolicy, verify_session

POLICY = SignInPolicy(os.environ["OC_PROJECT_KEY"])  # one per process; reads your project's rule, held a minute
REVOCATIONS = RevocationList(os.environ["OC_PROJECT_KEY"], os.environ["OC_SIGNING_SECRET"])  # one per process

token: str  # the token your page posted

try:
    session = verify_session(token, audience="https://your-site.example", policy=POLICY,
                             revocations=REVOCATIONS, method="POST")  # the request's method
except BondRequired as err:  # before InvalidSession: it is one
    ...  # 403: err.need, err.have (the account's floors, or None), err.back_url
except InvalidSession as err:
    # An outage is never "signed out": 503 for these, 401 for any other reason.
    unavailable = err.reason in {"revocations_unavailable", "key_set_unavailable", "bond_policy_unavailable"}
    ...  # 503 if unavailable else 401, with err.reason
```

`BondRequired` and `SessionEnded` are both `InvalidSession`s. Put their handlers
first: an `except InvalidSession` above them takes them too.

`check_oc_session` (3.2 or later) takes the same arguments and gives the answer
`withOcAuth` gives with `required: true`, as a status and a JSON body, instead
of raising: 401 `unauthenticated` for no token, a bad one or one the person
ended; 401 `no_session_handle`; 403 `bond_required` with `need`, `have` and
`back_url`; 503 `revocations_unavailable`, `key_set_unavailable` or
`bond_policy_unavailable`; 500 `unknown_project_key`. Both SDKs are held to the
same vectors.

```python
import os
from typing import Optional

from orangecheck import RevocationList, check_oc_session

REVOCATIONS = RevocationList(os.environ["OC_PROJECT_KEY"], os.environ["OC_SIGNING_SECRET"])  # one per process

bearer: Optional[str]  # the token the request brought, or None

checked = check_oc_session(bearer, "https://your-site.example",
                           revocations=REVOCATIONS, method="POST")  # the request's method
if checked.ok:
    session = checked.session  # signed in
else:
    status, body = checked.status, checked.body  # answer with these
```

The Python SDK has no framework wrapper. `verify_session`'s reasons are
`malformed`, `algorithm`, `unknown_key`, `key_set_unavailable`, `signature`,
`issuer`, `expired`, `not_yet_valid`, `claims`, `retired_key`, `audience`,
`no_session_handle` (3.0 or later), `ended`, `revocations_unavailable`,
`unknown_project_key`, `bond_policy_unavailable` and `bond_required`.

A `Session` has `sub`, `did_oc`, `jti`, `aud`, `iat` (it can be `None`), `exp`,
`oc_bond`, `claims` and, from 3.1, `rh`, the token's revocation handle (before
3.1, read `session.claims["rh"]`). To keep your own session, keep that `rh`,
your site's origin as `aud`, and `iat`.

`issuer=` names another auth host, a test stack's say: the token must carry it
as `iss`, and from 3.2 the keys come from `<issuer>/.well-known/jwks.json`, as
in Node (https, or http on localhost only). Before 3.2 they came from ochk.io's
key set whatever the issuer. To check against keys you hold, a stand-in issuer
in tests say, pass `jwks=`, a dict shaped like the key set's JSON; it wins, and
nothing is fetched.

`verify_session` reads the rule from me.ochk.io inside the first call that needs
it, then holds it a minute. That read is one round trip (235 to 270 ms in our
measurements) and waits at most four seconds; to keep it off your requests, see
[Python: warming](https://ochk.io/docs/me/sdk#python-warming).
`require_bond={"min_sats": …, "min_days": …, "max_age_secs": …}` sets the
requirement in code and wins over `policy`, like `requireBond`, with nothing to
read. Each value is left out or a whole number of 0 or more; anything else, such
as `"30"`, `29.9` or NaN, raises `TypeError` when the call is made (3.12.0 or
later). A key that names no project raises `InvalidSession` with reason
`unknown_project_key`; while the rule can't be read, the last one read stands
for ten minutes, and with none read in that time the sign-in is refused (reason
`bond_policy_unavailable`) rather than let through (2.10.1 or later).
`bond_meets(session, min_sats=…, min_days=…)` is the check on its own.

## your own accounts

When your site keeps users of its own, the token's `did_oc` is what ties a
person to one of them. Get this tie wrong and a stranger can take over an
account.

**A first sign-in creates a user; it never finds one.** Keep a table keyed by
`did_oc`, read from the verified token only:

```sql
CREATE TABLE oc_accounts (
    did_oc  text PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE REFERENCES users (id)
);
```

When a token's `did_oc` has no row, create a new user with an id you generate at
random and add the row in the same transaction. Never derive an identifier from
the did (an email such as `sha256(did)@yoursite`, a username, a slug) and look a
user up by it, or "find or create" by it: anyone can compute it from a did,
register that account first, and the person's first sign-in walks into it. If a
row points somewhere you don't expect, refuse the sign-in and log it.

**Two first sign-ins at once.** If the insert hits the primary key, another
request signed the same person in first. Either read the winner's row and carry
on, or answer `409` "try again" and the retry reads it. Both are safe, as long
as the losing request deletes the user it created: a user with no did is an
account nobody can reach.

**If an identity provider holds your users** (Supabase, Auth0, Cognito…), make
sure no one else can create the user a first sign-in is about to create: turn
public signup off, or create users only through the provider's admin API with a
call that refuses an existing address or username. When you then mint a provider
session for the new user, check it is for that user, and refuse it otherwise.
With Supabase: create the user with the admin API, mint a link for it with
`auth.admin.generateLink` (type `magiclink`), redeem the link's `hashed_token`
with `auth.verifyOtp` as `token_hash`, and check the user id at each step.

**Linking orangecheck to an account someone already has.**

- Ask for a fresh sign-in with your own login first (within the last five
  minutes, the window orangecheck uses for its own account changes), then open
  the popup. Never accept a sign-in the did itself started as that proof: on an
  account with its own login, a stolen orangecheck session must not be able to
  attach itself. Unlinking asks the same.
- Link the did only if no other user has it; otherwise refuse.
- Keep it to one did per account, enforced by the database (the `UNIQUE` above),
  unless your site has a reason for more.
- Email the account's own address when a did is linked or unlinked.
- Show the linked did on the account page, with an unlink button. Unlinking
  deletes the row and ends the sessions that did started on your site, and any
  grants it approved.

**After someone merges two orangecheck accounts.** The account they stop using
no longer signs in, so their next sign-in brings a `did_oc` you have no row for.
To keep their history:

- Keep every `rh` you see with the user it signed in as, in a table of its own
  (`rh` unique, `user_id`). A handle is for your site only and names nobody, so
  keeping it links nothing.
- When a verified token's `did_oc` has no row, look up its `merged_rh` first:
  your site's handle for each account merged into this one. `matchMergedUser`
  (me-client 0.45.0) and `match_merged_user` (`orangecheck` 3.4.0) answer
  `none`, `one` or `conflict`.
- `none`: create a user, as above. `one`: that user is theirs. Their old
  `did_oc` never signs in again, so with one did per account, put this `did_oc`
  in its place and add its `rh`, in one transaction under the same unique rules.
  `conflict`: the handles name two of your users; pick neither, create nothing
  and log it.
- Read `merged_rh` from the verified token only, never from anything the browser
  sends.
- It can't help with an account whose `rh` you never stored, and a Connect
  account claimed by the person is reported by `connect.claimed`, not here.
- A webhook's `sub` is derived from the `did_oc`, so it changes after a merge.
  Key your users by `did_oc` and keep `sub` beside it as a lookup.

```ts
import { matchMergedUser } from '@orangecheck/me-client/server';

declare const session: { did_oc: string; rh?: string; merged_rh?: unknown };
declare function userForHandle(rh: string): Promise<string | null>;

const match = await matchMergedUser(session, userForHandle);
if (match.kind === 'one') {
    // add session.did_oc and session.rh to match.user
} else if (match.kind === 'conflict') {
    console.warn('merged handles name more than one user:', match.users);
}
```

## verify without the SDK

A backend in Python, Go or anything else checks the token itself. It is a JWT
signed by the auth host, ochk.io. Its claims are
[`SessionPayload`](https://ochk.io/docs/sdk/auth-core/interfaces/SessionPayload) in the reference:

| Part                                                           | What to check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key set                                                        | `https://ochk.io/.well-known/jwks.json`: Ed25519 keys (`kty: OKP`), picked by the header's `kid`. Cache it, and fetch again when a token names a `kid` you have not seen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Retired key                                                    | A key the set marks `"status": "retired"` vouches only for a token it signed before it retired: `iat` earlier than its `retired_at` (unix seconds), and `exp` later than `iat` by at most 30 days (2592000 seconds). Refuse every other token it signed, and all of them when `retired_at` is missing or not a number. Read the set again at least hourly, so a key retired since you cached it stops vouching. [`retiredKeyVouches`](https://ochk.io/docs/sdk/auth-core/functions/retiredKeyVouches) is the rule in code, and its [test vectors](https://github.com/orangecheck/oc-packages/blob/main/auth-core/test-vectors/retired-key.json) give it case by case. |
| `alg`                                                          | `EdDSA`. Refuse anything else, `none` included.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `iss`                                                          | `https://ochk.io`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [`aud`](https://ochk.io/docs/sdk/auth-core/interfaces/SessionPayload#property-aud) | The origin of the page that opened the popup, exactly: `https://your-site.example`, or `http://localhost:5173` while you develop. Not your API's origin. A token with no `aud` is an orangecheck family session, not one for you: refuse it.                                                                                                                                                                                                                                                                                                                                                                                                      |
| [`iat`](https://ochk.io/docs/sdk/auth-core/interfaces/SessionPayload#property-iat) | Unix seconds: when ochk.io minted this token, at the end of the sign-in in the popup. The popup runs a full sign-in every time, so it is not when the person's ochk.io session began.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| [`exp`](https://ochk.io/docs/sdk/auth-core/interfaces/SessionPayload#property-exp) | Unix seconds: the earlier of the person's ochk.io session's end and `iat` + 30 days. Never refreshed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `sub`                                                          | The person's account id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `did_oc`                                                       | The person, `did:oc:` and 32 hex digits. Keep it beside your user row; it is the `user_address` you name when you fire an event.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `jti`                                                          | The token's own id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [`rh`](https://ochk.io/docs/sdk/auth-core/interfaces/SessionPayload#property-rh)   | The token's handle on your project's list of ended sessions, with `aud` as one string. Refuse a token without it: nothing could end its session. The SDKs refuse it from me-client 0.40 and `orangecheck` 3.0.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `oc_bond`                                                      | Present only when the person backed their account with a coin: its floors and a nullifier, never the coin. See [require a backed account](https://ochk.io/docs/me/require-bond).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

The token carries no email address and no name.

**Python**, with [`orangecheck`](https://ochk.io/docs/sdk/python) 3.15 or later, which also refuses
a token without `rh` and applies the retired-key rule above:

```python
from orangecheck import InvalidSession, verify_session

token: str  # the token your page posted

try:
    session = verify_session(token, audience="https://your-site.example")
except InvalidSession as err:
    print(err.reason)  # audience, expired, retired_key, signature, unknown_key, …
    raise
session.did_oc  # who signed in
```

Or with [PyJWT](https://pyjwt.readthedocs.io) 2.7 or later and `cryptography`.
PyJWT's key client doesn't expose a key's `status` or `retired_at`, so this
reads the key set itself:

```python
import json
import time
import urllib.request
from typing import Any

import jwt

JWKS_URL = "https://ochk.io/.well-known/jwks.json"
MAX_LIFETIME = 30 * 24 * 60 * 60  # the longest ochk.io signs any token for
_jwks: dict[str, Any] = {"keys": {}, "at": float("-inf"), "tried": float("-inf")}


def published_key(kid: str) -> dict[str, Any]:
    """The key set's entry for kid. Read again hourly and for an unseen kid, at most once a minute."""
    now = time.monotonic()
    due = now - _jwks["at"] > 3600 or kid not in _jwks["keys"]
    if due and now - _jwks["tried"] > 60:
        _jwks["tried"] = now
        with urllib.request.urlopen(JWKS_URL, timeout=10) as res:
            doc = json.load(res)
        _jwks["keys"] = {k["kid"]: k for k in doc["keys"] if isinstance(k.get("kid"), str)}
        _jwks["at"] = now
    if kid not in _jwks["keys"]:
        raise jwt.InvalidTokenError("unknown kid")
    entry: dict[str, Any] = _jwks["keys"][kid]
    return entry


def verify(token: str) -> dict[str, Any]:
    kid = jwt.get_unverified_header(token).get("kid")
    if not isinstance(kid, str):
        raise jwt.InvalidTokenError("no kid")
    entry = published_key(kid)
    claims: dict[str, Any] = jwt.decode(
        token,
        jwt.PyJWK(entry, "EdDSA").key,
        algorithms=["EdDSA"],
        audience="https://your-site.example",
        issuer="https://ochk.io",
        options={"require": ["exp", "iat", "iss", "aud", "sub", "jti"]},
    )
    if entry.get("status") == "retired":
        # A retired key vouches only for a token it signed before retired_at,
        # valid for at most 30 days.
        retired_at = entry.get("retired_at")
        if not isinstance(retired_at, (int, float)) or isinstance(retired_at, bool):
            retired_at = 0
        lifetime = claims["exp"] - claims["iat"]
        if not (claims["iat"] < retired_at and 0 < lifetime <= MAX_LIFETIME):
            raise jwt.InvalidTokenError("signed by a retired key")
    if not claims.get("did_oc"):
        raise jwt.InvalidTokenError("no did_oc")
    if not isinstance(claims.get("rh"), str) or not claims["rh"]:
        raise jwt.InvalidTokenError("no rh: nothing could end this session")
    return claims
```

## ending a session

The session on your site is yours, the way it is with any sign-in provider.
Signing out of ochk.io does not end it, and nothing refreshes the token. When
someone signs out of your site, drop your own session, and send the token to the
auth host so me.ochk.io refuses it from then on:

```sh
curl -X POST https://ochk.io/api/auth/revoke \
  -H 'Content-Type: application/json' \
  -d '{"tokens":["<the token>"]}'
# → {"ok":true,"revoked":1}
```

Up to 8 tokens per call, from your server. Holding a token is the authority to
end it, so no other credential is asked for.

What an ended token reaches, and when:

- ochk.io refuses it at once. me.ochk.io and the family sites refuse it within a
  minute while they can read ochk.io's list of ended sessions, which each reads
  at most once a minute. If a read fails, the last copy keeps answering until it
  is ten minutes old; after that they refuse writes, and me.ochk.io, ochk.app,
  vault and chat refuse reads too
  ([which site does what](https://ochk.io/docs/api-reference/auth-host#auth-scheme)).
- Your own server refuses it within about two minutes, wherever it checks
  sessions against
  [the list of ended sessions](https://ochk.io/docs/me/sdk#when-someone-ends-every-session) (`withOcAuth`
  or `checkOcSession` in me-client; `verify_session` with a `RevocationList` in
  `orangecheck` 3.3.1 or later). me.ochk.io lists the token for your origin
  within a minute, and your server reads that list at most once a minute. If a
  read fails, the last list read keeps answering until it is ten minutes old by
  its own clock; after that writes are refused and reads go on
  ([below](https://ochk.io/docs/me/sdk#when-someone-ends-every-session)). A copied cookie that holds it
  stops working there too.
- Clearing your own cookie is what ends the session on your site at once; do
  both.
- Tokens ended before 2026-10-24 are not on your list. They expire within 30
  days of sign-in.
- One account's ended tokens at your origin fold after 16: the list then holds a
  single cutoff for that account there, which ends every token of that account
  at your origin issued up to its newest ended one, including a session still
  live on another device. Other people's sessions are untouched. The list is
  capped at 20,000 entries per origin; past that me.ochk.io answers 503
  `revocations_unavailable` rather than send part of it, and your writes wait as
  for any outage.

[`revokeToken`](https://ochk.io/docs/sdk/me-client/server/functions/revokeToken) (me-client 0.41.0
or later) and `revoke_token` (`orangecheck` 3.2.0 or later) make that call. A
call that can't be valid throws before anything is sent; an outage or a refusal
is a result, never a throw, so it can't break a sign-out. `revoked` is 0 when
ochk.io could not read the token as its own, as when it has expired already.

```ts
import { revokeToken } from '@orangecheck/me-client/server';

declare const token: string; // the token the person signed in with

const result = await revokeToken(token);
if (!result.ok)
    console.warn(
        'could not end the token at ochk.io:',
        result.reason,
        result.status
    );
```

```python
from orangecheck import RevokeRefusal, revoke_token

token: str  # the token the person signed in with

result = revoke_token(token)
if isinstance(result, RevokeRefusal):
    print("could not end the token at ochk.io:", result.reason, result.status)
```

The reasons are `rate_limited`, `bad_request` and `unavailable` (an outage, a
timeout or an answer the SDK can't read). ochk.io takes 60 calls a minute per
IP, and a token that wasn't ended stays valid until it expires, up to 30 days:
queue a `rate_limited` or `unavailable` result and try again. Both take `issuer`
for another auth host, as one origin such as `https://ochk.io`.

### when someone ends every session

A person can end all their sessions at once: **Sign out everywhere** at the foot
of [ochk.app/me/account](https://ochk.app/me/account), removing a passkey, or
deleting the account. A test account does the same, which is how you check the
two minutes below. A token checked only against the key set still verifies after
that, until it expires. To refuse it on your site too, give your server your
project key and signing secret (from
[ochk.app/me/projects](https://ochk.app/me/projects)), with your domain verified
there:

```sh
OC_PROJECT_KEY=pk_live_…
OC_SIGNING_SECRET=…
```

Use the versions named here or later: earlier ones (`@orangecheck/auth-core`
2.11, me-client 0.34, `orangecheck` 2.7) are deprecated and no longer find
anything.

A sign-in token carries `rh`, its revocation handle for your origin. With both
variables set, `getOcSession`, `withOcAuth`, `ocAuthExpress` and `ocAuthHono`
(me-client 0.35.0 or later) look it up in me.ochk.io's list of ended handles for
that origin, read once a minute per origin and checked from memory, so a refusal
lands within about two minutes. A site served from `www` and the apex is covered
by one configuration: each token is looked up for its own origin. `audience` is
one origin or a list of exact origins (never `'*'`): a token passes when its
`aud`, always one string, is one of them.

The list is served only for your verified domain, any subdomain of it, and a
test project's development origin (below). Any other origin, such as a preview
on `*.vercel.app`, gets `403 audience_not_yours`, so its tokens read
`unverified` there: sign-in and reads work, writes are refused. To try the whole
flow before production, serve the preview on a subdomain of your verified domain
(`staging.yourapp.example`), or run it on localhost with a test project. If the
list can't be read, or is more than ten minutes old by its own clock, reads go
on and writes are refused until it can: the wrappers answer such a write
`503 revocations_unavailable` (me-client 0.38.0), not as signed out, so your
page retries instead of sending the person to sign in. The same goes for
ochk.io's key set: while it can't be read (and no copy younger than six hours is
held), a request that carries a token gets `503 key_set_unavailable`, reads and
writes alike (me-client 0.41.0). In your own code,
`checkOcSession(headers, options)` tells the cases apart: `signed_in` with the
session, `signed_out`, or `unavailable` with its `reason`. Every token while the
two variables are unset is checked by its signature alone.

**While you build.** A sign-in on `http://localhost:<port>` or
`http://127.0.0.1:<port>` gets a token for that origin, and no domain proves it.
On a test project, enter it as the development origin (your project's Sign-in
page on ochk.app, under Local development), and set the same origin as your
server's expected audience while you build. The list for that origin is then
served to that project's key, with or without a verified domain. Every test
project using that origin reads the same list; it names no one. "Sign out
everywhere" on ochk.app then ends your local session as it would a live one. A
live project has none, and going live clears it; any other project asking for a
local origin gets `403 dev_origin_not_declared`.

A token bound to your site without `rh` is refused, reason `no_session_handle`
(me-client 0.40.0, `orangecheck` 3.0.0): nothing could end it. Every token from
the sign-in popup carries one. `requireHandle: false` (Python
`require_handle=False`) accepts one minted some other way, and then sign out
everywhere doesn't end it. `checkOcSession` answers it `signed_out` with that
`reason`, and a wrapper with `required` answers `401 no_session_handle`. A site
that sets `audience: '*'` also accepts family sessions, which carry no `rh`:
your project's list can't end them. Their own list needs a token only
orangecheck's sites hold (`OC_REVOCATION_FEED_TOKEN`); without it a family
session answers `503 revocation_feed_unconfigured` (me-client 0.57.0; earlier
versions threw). Name your own origin as `audience` instead.

**Python** ([`orangecheck`](https://ochk.io/docs/sdk/python) 2.8.0 or later): keep one list per
process and pass it with the request's method.

```python
import os

from orangecheck import RevocationList, SessionEnded, verify_session

REVOCATIONS = RevocationList(os.environ["OC_PROJECT_KEY"], os.environ["OC_SIGNING_SECRET"])

token: str  # the request's sign-in token
method: str  # the request's method: "GET", "POST", …

session = verify_session(token, audience="https://your-site.example",
                         revocations=REVOCATIONS, method=method)
# SessionEnded (an InvalidSession, reason "ended") when the person ended it.
```

`REVOCATIONS.status(rh, aud, iat, jti=None)` answers one of three things, and
`verify_session` acts on it, asking with the token's `jti` too:

| `status`       | Means                                                                                                                                                                      | `verify_session` with `revocations=`                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `"live"`       | Not ended. Also a token without `rh`, which `verify_session` refuses first unless `require_handle=False`.                                                                  | Returns the session.                                                                                                              |
| `"revoked"`    | The person ended it: its `rh` is in the list and its `iat` is before the cutoff, or, asked with a `jti`, that token was ended on its own.                                  | Raises `SessionEnded` (reason `ended`).                                                                                           |
| `"unverified"` | No list for that origin younger than ten minutes (by its own `at`) could be read: me.ochk.io unreachable, or the list refused (domain not verified, an origin outside it). | Returns the session for `GET`, `HEAD` or `OPTIONS`; raises `InvalidSession` (reason `revocations_unavailable`) for anything else. |

That is the Node rule too: while the list can't be read, reads go on and writes
are refused. With no `method`, a request counts as a write.

The list for an origin is fetched inside the call that first needs it, then at
most once a minute. A fetch waits at most three seconds; after a failure the
next try waits ten seconds, and the last copy answers meanwhile. The first
failure logs one warning on the `orangecheck` logger. To keep the fetch off your
requests, see [Python: warming](https://ochk.io/docs/me/sdk#python-warming).

### if your own session replaces the token

When you sign the person into your own auth system (or a provider's) after
checking the token, apply **who can sign in** in that exchange. `verifyOcToken`
and `checkOcToken` check the token, not your project's rule; the wrappers apply
it. Post the token as a Bearer header to a route inside one, here a Next.js
Pages route, `pages/api/auth/orangecheck.ts`:

```ts
import type { JtiStore } from '@orangecheck/me-client/server';

import { spendOnce, withOcAuth } from '@orangecheck/me-client/server';

declare const store: JtiStore; // shared by all your servers, see spendOnce below
declare function startYourSession(
    didOc: string,
    handle: { rh: string; aud: string; iat: number }
): Promise<void>;

export default withOcAuth(
    async (req, res) => {
        const s = req.ocSession;
        if (req.method !== 'POST' || !s)
            return res.status(401).json({ ok: false });
        if (!(await spendOnce(s.jti, s.exp ?? 0, store)))
            return res.status(409).json({ ok: false, reason: 'token_spent' });
        await startYourSession(s.did_oc, {
            rh: s.rh ?? '',
            aud: String(s.aud),
            iat: s.iat ?? 0,
        });
        res.status(200).json({ ok: true });
    },
    {
        audience: 'https://yourapp.example',
        projectKey: process.env.OC_PROJECT_KEY!,
        required: true,
    }
);
```

The page sends `Authorization: Bearer <token>`. An account below your floor gets
`403 bond_required`, as on any wrapped route. If you check the token another
way, apply the rule with one call:
[`checkSignInRule`](https://ochk.io/docs/sdk/me-client/server/functions/checkSignInRule) (me-client
0.43.0) reads and holds it as the wrappers do and answers with their status and
body: `403 bond_required`, `503 bond_policy_unavailable` or
`500 unknown_project_key`. Then ask the list of ended sessions about the whole
session, `jti` included, as the wrappers do: a token the person ended on its own
is in the list by its `jti` alone.

```ts
import type { NextApiRequest, NextApiResponse } from 'next';

import { integratorRevocationCheck } from '@orangecheck/auth-core';
import { checkOcToken, checkSignInRule } from '@orangecheck/me-client/server';

// One per process. It reads OC_PROJECT_KEY and OC_SIGNING_SECRET; null without them.
const revocations = integratorRevocationCheck();

export default async function exchange(
    req: NextApiRequest,
    res: NextApiResponse
) {
    const checked = await checkOcToken(String(req.body?.token ?? ''), {
        audience: 'https://yourapp.example',
    });
    if (checked.status === 'unavailable')
        return res.status(503).json({ ok: false, reason: checked.reason });
    if (checked.status !== 'valid')
        return res.status(401).json({ ok: false, reason: checked.reason });
    const rule = await checkSignInRule(checked.session, {
        projectKey: process.env.OC_PROJECT_KEY!,
    });
    if (!rule.ok) return res.status(rule.status).json(rule.body);
    const ended = revocations
        ? await revocations.status(checked.session)
        : 'unverified';
    if (ended === 'revoked')
        return res.status(401).json({ ok: false, reason: 'ended' });
    if (ended !== 'live')
        return res
            .status(503)
            .json({ ok: false, reason: 'revocations_unavailable' });
    // spend the jti, start your session, end the token (below)
}
```

It takes only the session object `verifyOcToken`, `checkOcToken` or
`getOcSession` returned, and throws for claims read back from your own store. In
Python, `check_sign_in_rule(session, policy=POLICY)` (`orangecheck` 3.3.0) does
the same for the `Session` that `verify_session` returned and answers a
`SessionCheck`. Then spend the token once and don't store it:

- The exchange is a write. Ask the list of ended sessions about the whole token,
  `jti` included (Node: `status(checked.session)`; Python:
  `revocations=REVOCATIONS, method="POST"`), and refuse it while the list can't
  be read (`503`, never "signed out"), as the wrapper does for a POST: a token
  someone ended, on its own or everywhere, must not start a new session here.

- Keep its `rh`, `aud` and `iat` with that session on your server, written
  before you hand the session to the browser. Never let the browser bind them in
  a second call: it could bind another token's handle, or none.
- Spend its `jti` in a store all your servers share, until `exp`, so the same
  token can't start a second session on another instance:
  [`spendOnce(jti, exp, store)`](https://ochk.io/docs/sdk/me-client/server/functions/spendOnce)
  (me-client 0.41.0) or `spend_once(jti, exp, store)` (`orangecheck` 3.2.0).
  True the first time, false for a repeat or an expired token. The store is
  yours, anything with an atomic `add(jti, exp)` that answers true when it
  recorded the jti: a unique row, or Redis `SET jti 1 NX EXAT exp`.
  `MemoryJtiStore` is for tests and a single process only. In an async Python
  route, `spend_once_async` takes a store whose `add` is a coroutine.
- A token without `rh` is refused before it gets here (me-client 0.40.0,
  `orangecheck` 3.0.0): nothing could end the session it starts. Don't turn that
  off. Refuse to start a deployment that is missing `OC_PROJECT_KEY` or
  `OC_SIGNING_SECRET`.
- End the token right after the exchange (`revokeToken`): you never store it, so
  nothing could end it at sign-out. This puts that one token's `jti` in your
  list of ended sessions; it doesn't touch the session you just started, which
  the list holds to its `rh` and `iat`. Spending the `jti` once still stops a
  replay at your server while the list is a minute behind.
- Ask the list about the session on each request with its `rh`, `aud` and `iat`
  only, never the `jti`: you ended that token yourself after the exchange, so
  asking with its `jti` would end every session you start. In Node, keep one
  `integratorRevocationCheck()` from `@orangecheck/auth-core` 2.12.0 or later
  per process and `await check.status({ rh, aud, iat })`; in Python,
  `REVOCATIONS.status(rh, aud, iat)`. `"revoked"` means end your session;
  `"unverified"` means reads go on and writes wait (answer `503`, never "signed
  out"). If your own table of handles can't be read, treat only sessions
  orangecheck started as unverified; your other logins carry on. To tell them
  apart, mark a session orangecheck started where the mark travels with it: a
  claim in your own session token, or a column on your session row. Where every
  session looks alike (Supabase's `amr` reads `otp` however a session began),
  mark the user instead, say in Supabase's `app_metadata`, which rides in its
  JWT.

**Anything you mint during that session ends with it.** Your own session cookie,
API keys, OAuth grants to other apps, refresh tokens, long-lived links: if your
site issues it while someone is signed in through orangecheck, keep the token's
`rh`, `aud` and `iat` beside it (or beside the session that minted it), and when
the list answers `"revoked"`, revoke it too. Otherwise "sign out everywhere"
ends the cookie and leaves an API key working. While the list answers
`"unverified"`, the same rule as for your session applies to them: reads go on,
and writes made with them wait.

### the list of ended sessions, without an SDK

Sign a GET with your secret over its method, path and query, URI-encoding the
key and the audience:

```
GET https://me.ochk.io/api/integrator/revocations?project_key=<key>&aud=<aud>
X-OC-Signature: t=<unix>,v1=hmac_sha256(signing_secret, "<t>.GET /api/integrator/revocations?project_key=<key>&aud=<aud>")
```

`aud` is the token's `aud` exactly as it is, and must be your verified domain, a
subdomain of it, or your test project's development origin. The answer is
`{ "v": 1, "at": …, "tokens": ["<key>"], "accounts": {}, "handles": { "<rh>": <cutoff> } }`:

| Field      | Holds                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `at`       | Unix seconds: when ochk.io read its store of ended sessions for this copy. A list built in milliseconds reads as stale.                                                     |
| `tokens`   | The key of each token ended on its own for this origin, until it expires: base64url of the first 16 bytes of sha256(`"ocrev1:jti:" + jti`).                                 |
| `accounts` | Always empty here: an account ended everywhere, or one whose tokens at your origin folded, is in `handles` under its handle for your origin.                                |
| `handles`  | Each ended `rh` and its cutoff, in Unix seconds: the first whole second after the person ended their sessions. A sign-in after it has a later `iat` and is not ended by it. |

A session is ended when `tokens` holds the key of its `jti`, or when `handles`
holds its `rh` and its `iat` is before that cutoff, or it has no `iat`. Fetch it
at most once a minute per origin, and don't trust a list whose `at` is more than
ten minutes old, or more than a minute in the future. me.ochk.io answers
`503 revocations_unavailable` rather than serve a copy older than ten minutes.

Every refusal is `{ "ok": false, "error": "<code>" }`:

| Status | `error`                   | When                                                                                                                                    |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | `project_auth_required`   | No project key, or a missing or wrong signature. Its `detail` says how to sign.                                                         |
| 403    | `dev_origin_not_declared` | A `localhost` or `127.0.0.1` audience that isn't this test project's development origin. A live project has none.                       |
| 403    | `domain_unverified`       | Any other audience while your project's domain isn't verified.                                                                          |
| 403    | `audience_not_yours`      | Not your domain or a subdomain of it, or not an origin as a token carries it: `https://`, lowercase, no default port, no path or slash. |
| 503    | `revocations_unavailable` | The list can't be read.                                                                                                                 |

Treat any answer but a list you can read as a list that can't vouch: let reads
go on and refuse writes, as the SDKs do.

**Who you trust, and what it tells you.** The list comes from ochk.io, the auth
host, and me.ochk.io serves it; both are orangecheck. A handle is an HMAC under
a key only those two hold, bound to one origin: it names nobody, and another
site's handles for the same person never match yours. The list does show you how
many accounts ended their sessions recently, and when, as handles you can't tie
to anyone who hasn't signed in to your site. A plain sign-out on ochk.io still
does not end your session, by design, as with any sign-in provider.

### Python: warming

On a cold process, the first `verify_session` fetches what it needs inside the
request:

| What                              | Held     | First fetch, our measurements |
| --------------------------------- | -------- | ----------------------------- |
| ochk.io's key set                 | an hour  | 150 to 230 ms                 |
| your project's sign-in rule       | a minute | 235 to 270 ms                 |
| the revocation list for an origin | a minute | 250 to 470 ms                 |

Together that is 0.6 to 0.8 s; afterwards each is read from memory in
microseconds. `warm_session` (`orangecheck` 2.10.0 or later) takes your audience
and the `revocations` and `policy` you pass to `verify_session`, as
`warm_session(audience, *, revocations=None, policy=None, issuer=…, jwks=None)`.
From 3.2.0 it takes the same `issuer` and `jwks` too, and warms that issuer's
key set; with `jwks` given it fetches none. It fetches whichever is due, without
raising. Call it at startup and then every ten seconds from a background thread:

```python
import logging
import threading
import time

from orangecheck import RevocationList, SignInPolicy, warm_session

REVOCATIONS: RevocationList  # the ones you pass to verify_session
POLICY: SignInPolicy


def keep_warm() -> None:
    while True:
        result = warm_session("https://your-site.example", revocations=REVOCATIONS, policy=POLICY)
        if not result.ok:
            logging.warning("orangecheck warming: %s", "; ".join(result.failures()))
        time.sleep(10)


threading.Thread(target=keep_warm, daemon=True).start()
```

A copy is fetched only once it is due, so the thread makes nearly every fetch
and requests read memory. Pass a list of origins if you serve more than one.

From 2.11.0 `warm_session` says what it did. `result.keys`, `result.policy` and
`result.lists[origin]` each have a `state`: `"fetched"` (read just now),
`"kept"` (the copy is still fresh) or `"failed"`, with a `reason` such as
`HTTP 403 domain_unverified`, `unknown_project_key` or a list older than ten
minutes by its own clock. `result.failures()` lists the failed parts as
`"<part>: <reason>"`, and `result.ok` is true when there are none. A failure
does not mean requests are refused yet: an older copy may still answer, within
the limits below.

- **Threads.** One `RevocationList` and one `SignInPolicy` are safe to share
  between threads. Each copy has its own lock: while one thread fetches it, the
  other threads that need it wait for that same fetch, and nothing else waits.
- **Processes.** Each process keeps its own copies and makes its own fetches, so
  four gunicorn workers fetch four times as often. Start the warming thread
  inside each worker (gunicorn's `post_fork` hook, for example): a thread
  started before the fork does not run in the workers.
- **Async.** `verify_session`, `status()`, `warm_session`, `verify_webhook` and
  the `connect_*` calls are synchronous and wait on the network when they fetch
  (`verify_webhook` up to ten seconds for its key set). In an `async` handler,
  call them with `await asyncio.to_thread(...)`, or from a plain `def` route
  your framework runs in a thread. `AsyncClient` covers the stake checks only.
- **Failures.** After a failed fetch each copy waits ten seconds before trying
  again (the key set from 2.10.0), and the last good copy answers meanwhile: the
  key set for up to six hours, the list until it is ten minutes old, the rule
  for ten minutes (from 2.10.1). A key set with no key the SDK can use counts as
  a failed fetch (from 3.2.1; Node from auth-core 2.17.0).
- **Tests.** Pass `jwks=` with your own key set: `verify_session` and
  `check_oc_session` then never touch the cached ochk.io one, so no case leaks
  keys into the next. A stand-in for `RevocationList` implements
  `status_for(claims)`, which `verify_session` calls with the token's claims:
  `"live"` for a token with no `rh` key, otherwise what
  `status(rh, aud, iat, jti)` answers (an `rh` that is not a string is
  `"revoked"`).

## React

The session is your own cookie, so a React app reads it from your own
`/api/auth/me` (the `withOcAuth` sample above). No orangecheck library is needed
on the page beyond the popup; a small provider does it:

```tsx
import type { ReactNode } from 'react';

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';

type Account = { id: string; did_oc: string; display_name: string | null };
type Status = 'loading' | 'authenticated' | 'anonymous' | 'error';
type Session = {
    status: Status;
    account: Account | null;
    refresh: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<Status>('loading');
    const [account, setAccount] = useState<Account | null>(null);
    const refresh = useCallback(async () => {
        try {
            const r = await fetch('/api/auth/me');
            const next: Account | null = r.ok
                ? ((await r.json()).account ?? null)
                : null;
            setAccount(next);
            setStatus(
                next
                    ? 'authenticated'
                    : r.status === 401
                      ? 'anonymous'
                      : 'error'
            );
        } catch {
            setStatus('error');
        }
    }, []);
    useEffect(() => void refresh(), [refresh]);
    return (
        <SessionContext.Provider value={{ status, account, refresh }}>
            {children}
        </SessionContext.Provider>
    );
}

export function useSession(): Session {
    const session = useContext(SessionContext);
    if (!session) throw new Error('useSession needs <SessionProvider>');
    return session;
}
```

After `signInWithOc()` and your session route answer `ok`, call `refresh()`. To
sign out, call your own route that clears the cookie and
[ends the token](https://ochk.io/docs/me/sdk#ending-a-session), then `refresh()`. Treat `error` as "could
not check", not as signed out: offer a retry rather than the sign-in button.

`@orangecheck/auth-client` is for orangecheck's own sites (`*.ochk.io` and
ochk.app), which share orangecheck's session: its `<OcSessionProvider>` and
`<OcSignIn>` call ochk.io with the person's ochk.io cookie, which ochk.io
accepts only from those sites. Integrators use `@orangecheck/me-client`.

## `oc.event.fire` · send an event

How your app pays its users, one event at a time: `account_creation`,
`session_creation`, `stamp_signing`, `payment_authorization`, or a key of your
own. Each event is One-time, Per action or Per session, as the catalog
(`EVENT_SUBTYPES`) says; what your user earns comes from your price config via
`computeFees()`. The receipt is recorded under your `project_key` and shows on
your project's **Receipts** tab at ochk.app.

Call it from your backend. `signingSecret` signs the request as your project
(the SDK signs the exact bytes it sends), and `accountId` names who earns: the
person's account id (`did_oc`), stored beside your own user row. Before
me-client 0.30 this option was called `userAddress`; that name still works. It
forwards no sign-in token unless you pass one as `bearerToken`, or have called
`setBearerToken`: that one is process-wide, so on a server every later call
carries it until `clearBearerToken()`.

Paying your users is optional. An event earns only inside your project's
[pay periods](https://ochk.io/docs/me/paying-users) (always, in promos, or never); outside them the
call succeeds with `earned: false` and no event is recorded or charged. A
refusal throws a `MeClientError` carrying its HTTP status and code:
[when an event is refused](https://ochk.io/docs/me/api#when-an-event-is-refused) lists them and says
which to retry with the same `idempotencyKey`.

```ts
// server-side only · the secret never reaches a browser
import { oc } from '@orangecheck/me-client';

declare const user: { did_oc: string }; // your user row

const stamp = await oc.event.fire({
    project_key: process.env.OC_PROJECT_KEY!,
    subtype: 'stamp_signing',
    action_label: 'review · march invoice',
    signingSecret: process.env.OC_SIGNING_SECRET,
    accountId: user.did_oc,
});
if (stamp.earned) {
    // stamp.event.id, .gross_fee_sats, .user_earned_sats, .verify_url
} else if (stamp.reason === 'not_billed') {
    // recorded and charged nothing, so it paid nobody: stamp.event, stamp.detail
} else {
    // stamp.reason === 'not_paying'; stamp.next_pay_period, or null
}

// An event priced as a share of a payment carries the payment amount:
const paid = await oc.event.fire({
    project_key: process.env.OC_PROJECT_KEY!,
    subtype: 'payment_authorization',
    payment_amount_sats: 50_000,
    signingSecret: process.env.OC_SIGNING_SECRET,
    accountId: user.did_oc,
});
```

| Function              | Signature                                        | Note                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oc.event.fire(opts)` | `(FireEventOptions) => Promise<FireEventResult>` | `{ earned: true, event }` with the recorded event, `{ earned: false, reason: 'not_billed', event }` for one recorded and charged nothing, or `{ earned: false, reason: 'not_paying', next_pay_period }`. |

## `oc.config.validate` · check a price config locally

Check your config's shape and each event's own price limits, with no network
call. me.ochk.io checks more when you save, among them the domain, the
operator's price bounds and a price that earns your user nothing, so a config
that passes here can still be refused. You edit a project's prices on its
**Paying** tab at [ochk.app](https://ochk.app/me/projects); the SDK has no
`oc.config.update()`, because configs belong to projects, not accounts.

For each event you set what your user earns. You pay that plus the fee: 20% of
the price, rounded to a whole sat and at least 1 sat, so your user gets about
80%. Earns 100, you pay 125. The smallest earning is 1 sat, and you pay 2. The
**Paying** tab shows the exact price for each earning you set.

```ts
import type { IntegratorPriceConfig } from '@orangecheck/me-client';

import { oc } from '@orangecheck/me-client';

declare const cfg: IntegratorPriceConfig; // your project's config
const result = oc.config.validate(cfg);
if (!result.ok) console.error(result.errors);
```

| Function                  | Signature                                     | Note             |
| ------------------------- | --------------------------------------------- | ---------------- |
| `oc.config.validate(cfg)` | `(IntegratorPriceConfig) => ValidationResult` | No network call. |

The same function is also exported as the top-level `validateIntegratorConfig`.

## `oc.webhook.verify` · Ed25519 signature verification

**Always pass the raw body bytes**, not the parsed JSON. Frameworks that
re-serialize before your handler produce a different byte sequence and the
signature will not validate.

```ts no-check
const result = await oc.webhook.verify(
    rawBody, // string | Uint8Array
    req.header('OC-Signature'),
    req.header('OC-Key-Id')
);
if (!result.ok) return res.status(401).end(result.reason);
```

A missing header answers `ok: false`, so pass `req.header(...)` straight in. The
webhook key set, `https://me.ochk.io/api/dev-jwks`, is fetched and cached for an
hour when you pass no `jwk`; it is not the sign-in key set at
`ochk.io/.well-known/jwks.json`. Stale-on-error: a brief outage of that key set
uses the cached copy rather than rejecting every webhook.
[Webhooks](https://ochk.io/docs/me/webhooks) has a full receiver, in Python too.

> Agent delegation (`oc.delegation.*`) is a separate primitive and lives on
> [ochk.io/agent](https://ochk.io/agent) / [ochk.io/docs/agent](https://ochk.io/docs/agent), not on
> orangecheck. me-client doesn't ship a delegation namespace; reach for
> `@orangecheck/agent-signer` to issue or revoke agent delegations from your
> integration, and `@orangecheck/agent-core` to verify them.

## `oc.scope.*` · what people share with your app

Signing in tells your app the account's `sub` and `did_oc`, and nothing about
its email or Bitcoin address. Both ids are the same at every site, so sites that
compare notes can match a user. Scope reads below carry a per-app subject
instead. To read more (an email, a Bitcoin address, counts that tell people from
bots) you ask, and the person decides.

### `oc.scope.granted`

Read what a person shares with your project now, from your backend: name them
with `accountId` (their `did_oc`) and sign with your project's secret (me-client
0.57.0 or later). Returns the per-app `sub` plus the values they share.

```ts
// server-side only · the secret never reaches a browser
import { oc } from '@orangecheck/me-client';

declare const user: { did_oc: string }; // your user row

const { sub, scopes_granted, scopes } = await oc.scope.granted({
    project_key: process.env.OC_PROJECT_KEY!,
    accountId: user.did_oc,
    signingSecret: process.env.OC_SIGNING_SECRET!,
});

// `sub` here is per-app: different at every project. It is NOT the
// token's `sub` (req.ocSession.sub), which is the same at every site.
// Event payloads carry this scoped `sub` too, so don't join the two.
console.log(sub); // "sub_3K7xQ2mN1pYwB8tRvE…"

// `scopes` holds only what the person shares.
console.log(scopes.email); // "user@example.com" · or undefined
```

`accountId` and `signingSecret` go together: one without the other, or an
`accountId` that is not a `did:oc`, throws before any request. With neither, the
call reads the session its request carries, which only ochk.app's own pages
have, so from a browser on your site it answers `401`.

### `oc.scope.request`

Send the person to orangecheck's page that asks them, at ochk.app. After they
decide, the browser returns to `return_to`, and later `oc.scope.granted()` calls
reflect what they chose. `return_to` must be an https URL on your project's
domain, or on a subdomain of it once the domain is verified. Anything else
leaves the person on ochk.app.

```ts
import { oc } from '@orangecheck/me-client';

oc.scope.request(['email', 'bitcoin_address'], {
    project_key: 'pk_live_yourapp',
    return_to: window.location.href,
});
// ↑ this navigates · the line after never runs
```

For each item the person picks **Share for an hour**, **Share**, or **Don't
share**. Sharing an email address or a Bitcoin address asks them to confirm it's
them first: a passkey, an email code or a Bitcoin signature in the last 5
minutes. Turning on automatic renewal for one asks the same. They can stop
sharing any time at [ochk.app/me/apps](https://ochk.app/me/apps).

### Valid scopes

`oc.scope.request` takes these twelve (me-client 0.58.0). Earlier versions throw
on `cross_integrator_lifetime_sats`, `cross_integrator_distinct_count`,
`cross_integrator_oldest_event_at`, `cross_integrator_active_days` and
`trust_attestations_bundle`.

| Scope                                | Reveals                                                           | Use case                                       |
| ------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------- |
| `email`                              | The email address on the account, if it has one                   | Receipts, account recovery on your app         |
| `bitcoin_address`                    | The Bitcoin address on the account, if it has one, bare (`bc1q…`) | Checking holdings, refunds or payouts on-chain |
| `cross_integrator_event_count`       | One number: the person's events across every app                  | Telling people from bots                       |
| `cross_integrator_human_event_count` | The same count, without events an agent fired for them            | The same, when you treat agents differently    |
| `cross_integrator_lifetime_sats`     | One number: the sats apps have paid them across every app         | A strong sign of a real person                 |
| `cross_integrator_distinct_count`    | One number: how many different apps have recorded events for them | Telling people from bots                       |
| `cross_integrator_oldest_event_at`   | The date and time of their first recorded event in any app        | Asking for, say, 90 days of history            |
| `cross_integrator_active_days`       | One number: on how many days they did something in any app        | Telling a regular from a one-day account       |
| `trust_attestation_count`            | Four numbers about statements other apps made about them          | A stronger sign than activity alone            |
| `trust_attestations_bundle`          | The statements other apps made about them, each one in full       | When a count is not enough                     |
| `attest_tier`                        | Deprecated: `anonymous` / `bonded`                                | None; see below                                |
| `display_name`                       | Deprecated: nothing                                               | None: the sign-in gives you no name either     |

The six activity scopes count only events that cost someone something: test
fires, simulations and unbilled events are left out, so while payments run in
simulation the counts read 0 and the first event's date is empty.

Every value in `scopes` is a string. `trust_attestation_count` reads
`total,good,distinct_good_issuers,caution`; `parseTrustAttestationCount(value)`
decodes it. The other counts are whole numbers, and
`cross_integrator_oldest_event_at` is an ISO 8601 time, empty before their first
event. `trust_attestations_bundle` is a JSON array of statement ids: fetch each
with `GET /api/envelope/<id>?format=wrapped` and check its signature (see
[trust statements](https://ochk.io/docs/me/api)); the person picks which ones it holds at
[ochk.app/me/apps](https://ochk.app/me/apps). A value that can't be read at that
moment is left out, so a missing one means unknown, not none.

`display_name` shares nothing, and the sign-in gives you no name either: the
token names the person by `did_oc` alone. ochk.app no longer offers it. Asking
for it still works and adds nothing to `scopes`.

Don't gate on `attest_tier` to keep bots out. It is deprecated, and `bonded`
only ever meant one signature over an address, with no amount behind it. To let
in only accounts backed by bitcoin, read the token's `oc_bond` claim: see
[Who can sign in](https://ochk.io/docs/me/require-bond).

### Migration from `user_address` (≤ 0.9.0)

Pre-0.10.0 webhook payloads delivered the user's master address as
`user_address`. From 0.10.0 onward, payloads use the per-app `sub` (the same
scoped id `oc.scope.granted()` returns, not the token's `sub`) plus optional
`scopes` (shared fields). To migrate:

1. Update SDK to `^0.10.0`.
2. Switch from `event.user_address` → `event.sub` for user records in your
   database.
3. If you actually need the user's email or address, call
   `oc.scope.request(['email'])` and read `event.scopes.email` /
   `oc.scope.granted().scopes.email`.

The `user_address` field is retired from outgoing payloads in the matching
me.ochk.io deploy. Existing rows in your database keyed on old `user_address`
values stay valid; just expect new events to use `sub`.

| Function                         | Signature                                    | Note                                                           |
| -------------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| `oc.scope.granted(opts)`         | `(GrantedOptions) => Promise<GrantedResult>` | What a person shares with your project now. From your backend. |
| `oc.scope.request(scopes, opts)` | `(Scope[], RequestOptions) => never`         | Navigates to the page that asks · throws after.                |

## `oc.session.*` · sessions (Per session)

To pay per session, your server sends the `session_creation` event with
`oc.event.fire` (above), once per real session. That is all an integration
needs.

`oc.session.create`, `refresh` and `invalidate` are ochk.app's own: me.ochk.io
takes them only with an ochk.app session, so from your site they answer `401`. A
`Session` carries `issued_at` and `expires_at` (me-client 0.57.0; the type said
`opens_at` before, which never arrived).

| Function                    | Signature                             | Note                      |
| --------------------------- | ------------------------------------- | ------------------------- |
| `oc.session.create(opts)`   | `(SignInOptions) => Promise<Session>` | ochk.app only. No charge. |
| `oc.session.refresh(id)`    | `(string) => Promise<Session>`        | ochk.app only. Free.      |
| `oc.session.invalidate(id)` | `(string) => Promise<void>`           | ochk.app only. Free.      |

## `oc.payment.authorize` · a payment intent

Call it from your server, with the person's sign-in token. me.ochk.io answers no
browser on another site, so your page posts the token from `signInWithOc()` to
your server, as it does to start a session, and your server forwards it.

```ts
// server-side: the token your page posted after signInWithOc()
import { oc } from '@orangecheck/me-client';

declare const token: string; // the person's sign-in token

const result = await oc.payment.authorize({
    amount_sats: 240_000,
    description: 'march invoice',
    bearerToken: token, // for this call only (me-client 0.58.0)
});
// result.id, result.user_envelope_id, result.verify_url
```

`bearerToken` goes with this call alone, so two people paying at once never
share one. The token decides whose payment it is: me.ochk.io uses its account's
`did_oc` and ignores the old `identity` option. Without a token the call answers
`401 payment_not_authenticated`. The token must come from a sign-in on your live
project's verified domain; one from any other site answers
`403 payment_site_not_registered`. `user_envelope_id` is the receipt's id, the
same as `id`, and `verify_url` opens that receipt.

The call records a payment intent and settles nothing: the answer carries
`mode: 'stub'`, `settles: false` and `is_stub: true`. No sats move, your balance
is not charged, and the person earns nothing from it. To bill for a payment,
fire the `payment_authorization` event with `oc.event.fire` and its
`payment_amount_sats`.

## Other signals

[Who can sign in](https://ochk.io/docs/me/require-bond) is the signal to reach for first: an account
backed by a coin, one account per coin at your app. These are others.

### `oc.identity.verifyActivityAttestation` · activity across apps

Verify a signed activity attestation the person forwarded to you. It carries six
values about their activity across every app (event_count, human_event_count,
lifetime_sats, distinct_integrator_count, oldest_event_at, active_days) and a
24h expiry, signed with the me.ochk.io receipt key, the same key that signs
every paid receipt.

```ts no-check
import { oc } from '@orangecheck/me-client';

const result = await oc.identity.verifyActivityAttestation(bundle);
if (!result.ok) return res.status(401).send(result.reason);

const a = result.attestation!;
if (a.lifetime_sats < 10_000) return res.status(403).send('low signal');
if (a.distinct_integrator_count < 3) return res.status(403).send('low breadth');
if (Date.parse(a.oldest_event_at!) > Date.now() - 90 * 86_400_000) {
    return res.status(403).send('too new');
}
```

It runs seven checks: the bundle has `sig`, `kid` and `canonical_b64`;
`canonical_b64` decodes; the bytes are an activity attestation in canonical
form; the attestation matches the signed bytes and its `id` is their SHA-256; a
key with the matching `kid` is in the receipt key set (or is the `jwk` you
pass); the Ed25519 signature; and `now < expires_at`. Each check is a row in
`result.checks` for logging.

The receipt key set at `me.ochk.io/.well-known/oc-envelope-jwks.json` is fetched
and cached for an hour when you pass no `jwk`. It is **distinct** from the key
set that signs webhook deliveries: same Ed25519 curve, different URL, cached
separately. Pass `{ jwk }` to skip the fetch on edge runtimes or air-gapped
deployments.

The values are costly to fake (sats come from what apps really paid, breadth
needs separate apps, `oldest_event_at` can't be back-dated, active days need
time) and cheap to check: one call, one signature, the same on Node 20+, Vercel
Edge and the browser.

> The same checks run in the browser at
> [ochk.app/verify-activity](https://ochk.app/verify-activity), for anyone who
> receives a forwarded attestation and doesn't want to write the verifier. The
> SDK and the page give the same verdict on the same input.

## Types

Every type comes from the main entry, `@orangecheck/me-client`:

```
EventClass · EventSubtype · ClassASubtype · ClassBSubtype · ClassCSubtype
AttestTier · SiteFeeShape · IntegratorEventConfig · IntegratorPriceConfig
ComputedFees · ValidationResult · BillableEvent · Session · SessionPolicy
SignInOptions · PaymentAuthorizeOptions · PaymentResult · TelemetryEvent
FireEventOptions · FireEventResult · OcPublicJwk · VerifyOptions · VerifyResult
Scope · GrantedOptions · GrantedResult · RequestOptions
```

`/server` adds
[`SessionPayload`](https://ochk.io/docs/sdk/me-client/server/interfaces/SessionPayload),
`BondClaim`, `VerifyOcOptions`,
[`WithOcAuthOptions`](https://ochk.io/docs/sdk/me-client/server/interfaces/WithOcAuthOptions) and
`OcHonoEnv`. The class names (`ClassASubtype` and so on) are the API's names for
the three groups: One-time, Per action and Per session.

## Constants and helpers

| Export                                          | Signature                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| `PLATFORM_FEE_POLICY`                           | `{ pct: 0.2; min_floor_sats: 1; ratified: string }`                         |
| `MIN_INTEGRATOR_PRICE_SATS`                     | `1`                                                                         |
| `computeFees(cfg, payment_amount_sats?, opts?)` | `(IntegratorEventConfig, number?, { is_agent?: boolean }?) => ComputedFees` |
| `validateIntegratorConfig(cfg)`                 | `(IntegratorPriceConfig) => ValidationResult`                               |
| `setBearerToken(token)`                         | `(string \| null) => void` · a token for later calls                        |
| `getBearerToken()` / `clearBearerToken()`       | `() => string \| null` / `() => void`                                       |

`MIN_INTEGRATOR_PRICE_SATS` is the smallest price the server takes. At 1 sat the
whole price is the fee, so the smallest earning is 1 sat, and you pay 2.
`computeFees` with `{ is_agent: true }` prices an event an agent fired by the
config's `agent` override, and throws `agent_refused` when that override refuses
agents.

## Where it lives

- **npm**:
  [@orangecheck/me-client](https://www.npmjs.com/package/@orangecheck/me-client)
- **source**:
  [oc-packages/me-client](https://github.com/orangecheck/oc-packages/tree/main/me-client)
- **types**: the main entry, `@orangecheck/me-client`, mirrors
  `oc-me-web/src/lib/events/types.ts`. There is no `/types` subpath.
