# compat

Pins what the published readers do with an account that carries an identity key orangecheck
holds for it (ME-OWN-KEYS-PLAN §2). Nothing here is published, and nothing here is built from
this repository: `package.json` installs exact versions from npm, and `py/requirements.txt`
installs exact versions from PyPI, with hashes.

The rule is that such a key appears only in new optional fields. Every reader a site already runs
must read the account as it did before: never as a Bitcoin sign-in, never with a Bitcoin address
as its own, never with a sign-in method it does not know.

## What it reads

`fixtures/email-account.json` is an email account recorded from ochk.io's real sign-in, mint and
read paths by oc-www's `src/lib/auth/own-keys-contract.test.ts`. The file names the commit it ran
on. It holds the session token's claims, the claims of the token the sign-in popup mints for a
site, the `/api/auth/me` and `/api/auth/identities` answers, and the statement ochk.io signs to
vouch for an OC Chat session device. No token or vouch is committed: `src/mint.ts` signs the
recorded claims and statement at test time with a key made for the run.

`src/account.ts` builds the same account with its identity key in the plan's new field,
`identity_key`, and compares what each reader returns for both. The tool sites' own
`/api/auth/me` is site-kit's `createMeHandler` over the session token, so site-kit is read
that way, with vault-core's `fetchIdentity` over its answer.

`fixtures/custody-records.json` holds the public custody records ochk.io will publish (kind 30078),
copied from the keys package's vectors at the commit it names: each record's envelope and its
published tags. `test/custody-records.test.ts` signs them as Nostr events at test time and serves
them, beside a device binding and an attestation, from an in-memory relay: lock-device and the
attest SDK must skip every record, never throw on one, and read their own events as before.

`fixtures/me-email-account.json` is what me.ochk.io sends integrators about the same account once
its ochk.io answers and token carry the identity key, recorded by oc-me-web's
`src/__tests__/api/own-keys-contract.test.ts` from ochk.io's answers above: the scopes route by
session and by signed backend read, a delivered webhook body, the account the sign-in popup posts
to a family site and to any other, and an activity attestation's signed bytes. No signature is
committed: the me-client tests sign the webhook and the attestation with a key made for the run,
and move their recorded times to now.

## Run it

```sh
yarn install --frozen-lockfile
uv venv .venv && uv pip install --python .venv/bin/python --require-hashes -r py/requirements.txt
COMPAT_PYTHON=.venv/bin/python yarn test
COMPAT_PYTHON=.venv/bin/python yarn mutants
```

`yarn mutants` runs the suite once as is, then once for each place §2 forbids the address
(`FORBIDDEN` in `src/account.ts`, `ME_FORBIDDEN` in `src/me.ts`) and each tag that would put a
record where a published reader asks for its own events (`RECORD_FORBIDDEN` in `src/records.ts`),
chosen with
`COMPAT_PLACEMENT`, then once with every reader replaced by one that returns nothing
(`COMPAT_HOLLOW=1`). The first run must pass and every other run must fail.

To record the fixtures again, run the first command from a clean oc-www checkout. Copy the
recording's `recorded_from`, `token_claims`, `me` and `scope_grant_identities` into oc-me-web's
`src/__tests__/fixtures/oc-www/own-keys-email-account.json`, commit, and run the second command
from that clean oc-me-web checkout:

```sh
OC_RECORD_COMPAT=$PWD/../oc-packages/compat/fixtures/email-account.json \
  npx vitest run src/lib/auth/own-keys-contract.test.ts
OC_RECORD_COMPAT=$PWD/../oc-packages/compat/fixtures/me-email-account.json \
  npx vitest run src/__tests__/api/own-keys-contract.test.ts
```
