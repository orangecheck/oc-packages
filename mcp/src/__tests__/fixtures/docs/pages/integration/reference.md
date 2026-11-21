# Run the whole funnel yourself

[`oc-onboarding-examples`](https://github.com/orangecheck/oc-onboarding-examples)
is the whole onboarding funnel as small sites you can fork and run, under MIT.
Each one is a site with its own login that uses both [pathways](https://ochk.io/docs/integration) at
once:

- it gives each user an orangecheck account through [Connect](https://ochk.io/docs/connect);
- it lets them claim that account at ochk.app;
- it signs them in with orangecheck afterwards.

| Example                                                                                             | Stack                                                       |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`node-next/`](https://github.com/orangecheck/oc-onboarding-examples/tree/main/node-next)           | Next.js 16 (Pages Router), `@orangecheck/me-client`, SQLite |
| [`python-fastapi/`](https://github.com/orangecheck/oc-onboarding-examples/tree/main/python-fastapi) | FastAPI with server-rendered pages, `orangecheck`, SQLite   |

## Run it with no account

Each example starts **offline**. Stand-ins in its own folder answer for the
sign-in popup, the Connect API and ochk.app's claim page, in the same shapes, so
you can click through the whole funnel before you have a project.

```sh
git clone https://github.com/orangecheck/oc-onboarding-examples
cd oc-onboarding-examples/node-next
npm install && npm run dev       # http://localhost:3000
```

```sh
cd oc-onboarding-examples/python-fastapi
uv sync && uv run python -m app  # http://localhost:8000
```

Sign up and tick the box. Claim the account. Confirm your password, link
orangecheck, sign out, then sign in with orangecheck to land in the same
account. Each example's README walks through it.

## The funnel, and where each step stands

| Step | What the person does                        | Status                                                                                              |
| ---- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1    | Signs up with your site's own login         | Yours. orangecheck is not involved.                                                                 |
| 2    | Gets an orangecheck account through Connect | Live. First run on 2026-10-23 by the examples' own check, which runs weekly against a test project. |
| 3    | Claims that account at ochk.app             | Deployed. A claim by a person has not been run live yet.                                            |
| 4    | Signs in with orangecheck                   | Live.                                                                                               |
| 5    | Moves to their own keys                     | **Not open.**                                                                                       |

orangecheck holds every key that can move funds while the system is in testing;
[ochk.app/custody](https://ochk.app/custody) says who holds what, read live.
Signing in with your own Bitcoin key is self-custody of that key today. It does
not move what you earn. The examples are identity only: they send no events and
pay nobody.

## Run it live

Everything comes from one free project at
[ochk.app/me/projects](https://ochk.app/me/projects), in test mode or live:

| You need                      | Where                                                     | Used for                                      |
| ----------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| The project key (`pk_test_…`) | The project's Keys & webhooks tab                         | Sign in with orangecheck and its sign-in rule |
| The signing secret            | Keys & webhooks, after a fresh identity check             | Refusing sessions people ended everywhere     |
| A verified domain             | The project's Domain step (a DNS record or a meta tag)    | The list of ended sessions for your origin    |
| A Connect app and its API key | The Sign-in tab, "Your own login". The key is shown once. | Provision, claim links, delete                |

Put them in `.env` as the example's `.env.example` names them, with
`SITE_ORIGIN` set to the site's exact origin.

On localhost, declare a development origin on your test project (its Sign-in
page, under Local development), equal to `SITE_ORIGIN` exactly, port included.
Set the signing secret locally too, and "Sign out everywhere" on ochk.app ends
your local session as it would a live one
([how it works](https://ochk.io/docs/me/sdk#when-someone-ends-every-session)). With the secret set
and no origin declared, sign-in itself answers `503 revocations_unavailable`;
with no secret, a local run signs in but doesn't refuse a session someone ended
everywhere, and a banner says so. A deployment refuses to start without the
secret.

## What each step follows

The examples follow these pages, and each one has tests for the rules they set.

| Step                                                        | The rule                                                                                      | Docs                         |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------- |
| An account on sign-up, without asking or with an opt-in box | Unticked means no call at all; only a tick sends `consent`, in the SDK's words                | [Connect](https://ochk.io/docs/connect)          |
| A claim link                                                | Minted for the signed-in user, at the moment they ask; works once, for 15 minutes             | [Connect](https://ochk.io/docs/connect)          |
| Deleting an account                                         | Delete the orangecheck account first; one that earned stays, and its person gets a claim link | [Connect](https://ochk.io/docs/connect)          |
| Sign in with orangecheck                                    | Spend the token once, refuse one without `rh`, keep `rh`, `aud` and `iat` with your session   | [Quickstart](https://ochk.io/docs/me/quickstart) |
| Sessions ended everywhere                                   | Ended there means signed out here; an unreadable list is never "signed out"                   | [SDK reference](https://ochk.io/docs/me/sdk)     |
| Linking orangecheck to an account with its own login        | A fresh sign-in with your own login first; one did per account; tell the account's email      | [Quickstart](https://ochk.io/docs/me/quickstart) |
| `connect.claimed`                                           | Verify the signature over the raw body                                                        | [Webhooks](https://ochk.io/docs/me/webhooks)     |

## What you host, and what you depend on

You host the site, its users, its sessions, the table of spent sign-in tokens
and its webhook receiver. All of it is yours to run anywhere and to take with
you.

orangecheck runs the rest, and none of it can be self-hosted today:

| Service    | What the funnel uses it for                                                    |
| ---------- | ------------------------------------------------------------------------------ |
| ochk.io    | Issues sign-in tokens, ends them, and answers the Connect API                  |
| me.ochk.io | The sign-in popup, your project's sign-in rule, and the list of ended sessions |
| ochk.app   | Where a person claims their account, and where you make your project and keys  |

The SDKs are open, and so is checking a token offline against the published
keys. "Host it yourself" means you own your integration and your users' mapping,
and can leave. It does not mean you can run orangecheck without orangecheck.

## How it stays current

- Each example's tests run its real routes against a real database, offline, on
  every push.
- A weekly job runs Connect live against a test project. Its only secret is that
  project's Connect key, which can't sign anyone in.
- A day after an `@orangecheck/*` package or `orangecheck` on PyPI publishes,
  the bump arrives as a pull request and merges once every check passes.

More examples, across every protocol, are on [Examples](https://ochk.io/docs/reference/examples).
