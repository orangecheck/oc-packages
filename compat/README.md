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
site, and the `/api/auth/me` and `/api/auth/identities` answers. No token is committed:
`src/mint.ts` signs the recorded claims at test time with a key made for the run.

`src/account.ts` builds the same account with its identity key in the plan's new field,
`identity_key`, and compares what each reader returns for both.

## Run it

```sh
yarn install --frozen-lockfile
uv venv .venv && uv pip install --python .venv/bin/python --require-hashes -r py/requirements.txt
COMPAT_PYTHON=.venv/bin/python yarn test
COMPAT_PYTHON=.venv/bin/python yarn mutants
```

`yarn mutants` runs the suite once as is, then once for each place §2 forbids the address
(`FORBIDDEN` in `src/account.ts`, chosen with `COMPAT_PLACEMENT`), then once with every reader
replaced by one that returns nothing (`COMPAT_HOLLOW=1`). The first run must pass and every
other run must fail.

To record the fixture again, from a clean oc-www checkout:

```sh
OC_RECORD_COMPAT=$PWD/../oc-packages/compat/fixtures/email-account.json \
  npx vitest run src/lib/auth/own-keys-contract.test.ts
```
