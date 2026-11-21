# Integrating with orangecheck

You want your users to have an **orangecheck account**. There are **two
pathways**, and which one is yours comes down to a single question: **do you
already have a login?**

## Which path is mine?

| If you…                                                                                                     | Pathway                             | What you add                                       |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------- |
| are building sign-in from scratch, or are happy for orangecheck to _be_ your login                          | **1 · orangecheck as your sign-in** | the sign-in popup, and `withOcAuth` on your server |
| already run your own login — Google, Auth0, Clerk, NextAuth, email/password, anything — and want to keep it | **2 · OC Connect**                  | one server-side HTTPS call                         |

Both end at the same place: each of your users has an orangecheck account. They
differ only in who owns the sign-in screen.

## Pathway 1 — orangecheck as your sign-in

orangecheck _is_ your sign-in. Create a project at
[ochk.app](https://ochk.app/me/projects/new), then:

```ts
// In the browser, inside a click handler
import { signInWithOc } from '@orangecheck/me-client/popup';

const result = await signInWithOc();
if (result) {
    await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: result.token }),
    });
}
```

`/api/auth/session` is a ten-line route of your own: it verifies the token and
keeps it in an httpOnly `oc_session` cookie
([the Quickstart has it](https://ochk.io/docs/me/quickstart#2--add-the-sign-in-popup)). Every route
after that reads the cookie:

```ts
// On your server · Next.js Pages, pages/api/auth/me.ts
import { withOcAuth } from '@orangecheck/me-client/server';

export default withOcAuth(
    async (req, res) => {
        if (!req.ocSession) return res.status(401).json({ ok: false });
        res.status(200).json({ ok: true, did_oc: req.ocSession.did_oc });
    },
    {
        audience: 'https://yourapp.example',
        projectKey: process.env.OC_PROJECT_KEY!,
    }
);
```

Your users sign in with an **email one-time code**, **Google / GitHub**, or a
**Bitcoin wallet**. orangecheck handles every path, and the popup hands your
page a token bound to your origin. No passwords, no auth backend to run, no
OAuth apps of your own to register. `projectKey` lets you choose
[who can sign in](https://ochk.io/docs/me/require-bond) from your project: everyone, or only
accounts backed by bitcoin.

The [Quickstart](https://ochk.io/docs/me/quickstart) walks this end to end, with Express and Hono.

**On orangecheck's own sites only** (`*.ochk.io` and ochk.app), you can mount
`<OcSignIn>` from [`@orangecheck/auth-client`](https://ochk.io/docs/sdk/auth-client/README) in your
page instead of the popup, with `<OcSessionProvider>` and `useOcSession()`.
Those sites share orangecheck's session. Anywhere else it cannot sign anyone in,
so use the popup.

→ [Quickstart](https://ochk.io/docs/me/quickstart) · [`@orangecheck/me-client`](https://ochk.io/docs/me/sdk) ·
[auth host API](https://ochk.io/docs/api-reference/auth-host)

## Pathway 2 — OC Connect

You keep the login you already run — it does not change at all. After your user
authenticates, by _any_ means, your **backend** makes one server-side call to
`POST https://ochk.io/api/connect/provision` with your Connect API key, and that
user gets an orangecheck account. No new SDK; no change to how anyone signs in;
nobody sees a second login screen.

→ [OC Connect guide](https://ochk.io/docs/connect)

## Both on one site

A site with its own login can offer both: Connect for the people who use that
login, and sign in with orangecheck for everyone else.
[Run the whole funnel yourself](https://ochk.io/docs/integration/reference) has open example sites
in Node and Python that do exactly that, and run offline with no account.

## What you get, either way

An **orangecheck account** for each user, recognized by every app that uses
orangecheck. Its id, `did:oc`, is opaque and the same in every app. Who holds
the key behind it depends on how the user signed in: a Bitcoin wallet user holds
their own signing key, and on every other path orangecheck holds it. A person
can back their account with bitcoin they hold; that is what "backed by bitcoin"
means, and only backed accounts carry it. How your users authenticated is your
concern; the account is the durable thing underneath.

## Not covered here

Paying your users in sats is optional and separate from sign-in. See
[Paying your users](https://ochk.io/docs/me/paying-users) and track 2 of the
[Quickstart](https://ochk.io/docs/me/quickstart).
