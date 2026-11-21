# Who can sign in

Every orangecheck account signs in to your app by default, however it was made:
email, Google, GitHub or a Bitcoin wallet. To keep bots out, you can let in only
accounts **backed by bitcoin**. The person has backed their account with one
coin they hold ([bonds](https://ochk.io/docs/attest/bonds)). The coin stays in their wallet, and you
never see it: your token carries only floors, when the coin was last checked,
and a nullifier for your app.

## 1. Set the floor

Open your project on [ochk.app](https://ochk.app/me/projects), go to its
**Sign-in** tab, and under **How people sign in** turn on **orangecheck
sign-in**. **Who can sign in** appears below it. Pick a minimum amount and age,
for example 100,000 sats unspent 30 days. The lowest floor is 1,000 sats:
ochk.io won't take a smaller coin. The floor is saved in the project and served,
uncached, at `GET https://me.ochk.io/api/integrator/<project_key>/sign-in`:

```text
{"ok":true,"require_bond":null}                                  Everyone
{"ok":true,"require_bond":{"min_sats":100000,"min_days":30}}     Backed by bitcoin
404 {"ok":false,"reason":"project_not_found"}                    no such project
```

`min_sats` is one of 1000, 10000, 100000, 1000000 or 10000000, and `min_days`
one of 0, 7, 30, 90 or 365. Those two are the whole floor: there is no age limit
in it (`maxAgeSecs`, below, is set only in code). Read any other key as unknown
and ignore it. The wrappers read it for you; read it yourself only where no
wrapper runs.

## 2. Enforce it on your server

```ts
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

A change in your settings is read by your server within a minute. If it can't
read the rule, the last one read stands for up to ten minutes, and after that
signed-in requests are refused until it can. An account below the floor gets:

```text
403 {
  "ok": false,
  "reason": "bond_required",
  "need": { "min_sats": 100000, "min_days": 30 },
  "have": { "sats_floor": 10000, "days_floor": 90 },
  "back_url": "https://ochk.app/me/account#backing"
}
```

Link that person to `back_url`, where they can back their account. `have` is
`null` when no coin backs it. If your requirement can't be read, the last one
read stands for ten minutes; with none read in that time, a signed-in request
gets `503 bond_policy_unavailable` rather than being let through unchecked
(me-client 0.36.1 and `orangecheck` 2.10.1 and later; an answer that doesn't
state the requirement counts as unreadable). The requirement is about who signs
in: a request with no session is not held to it and never waits on reading it
(me-client 0.37.0), so pages for signed-out people keep working while me.ochk.io
can't be reached. Set `required: true` if a route must refuse signed-out
requests. `orangecheck`'s `verify_session` only ever runs on a token. A
`projectKey` that names no project gets `500 unknown_project_key` (me-client
0.32 and later).

ochk.io re-checks the coin when its last check is over ten minutes old, and
every claim says when that was (`oc_bond.checked_at`). You can't ask for a fresh
check, but you can refuse a stale one with `maxAgeSecs`, which only code sets.

In code, `requireBond: { minSats, minDays, maxAgeSecs }` holds signed-in
accounts to the same bar as the project setting and wins over `projectKey`. It
also refuses a request with no session,
`401 { ok: false, reason: 'unauthenticated' }`, as `required: true` does, so
leave it off routes signed-out people use, and use the project setting there
instead. Each value is left out or a whole number of 0 or more; anything else,
such as `NaN` from an unset environment variable, a string or a fraction, throws
when the adapter is made (me-client 0.53.0), and `bondMeets` is false for it.
`readBondClaim(session)` and
`bondMeets(session, { minSats, minDays, maxAgeSecs })` come from
`@orangecheck/me-client/server` (or `@orangecheck/auth-core`) for your own
checks: a fast lane, a higher free tier, a ban list.

## 3. Keep one account per nullifier

`oc_bond.nullifier` is the same for the same coin at your app every time, and
only ochk.io can compute it, so it doesn't reveal the coin. Keep one account per
nullifier: that is the real bot check at your site. A floor says some coin backs
the account; the nullifier tells you whether that coin already backed another
account of yours. Ban a nullifier to ban the coin.

A coin backs one account at a time. Released from one account, it can back a
different one only 30 days later. Sites on `*.ochk.io` share one family session,
so they share one nullifier.

Requires `@orangecheck/me-client` ≥ 0.27.3. `back_url` and the snake_case `need`
arrive in 0.28.0.
