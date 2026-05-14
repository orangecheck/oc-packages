# `@orangecheck/auth-core`

> **Full reference:** [docs.ochk.io/sdk/auth-core](https://docs.ochk.io/sdk/auth-core) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


**Cross-subdomain session primitives for the OrangeCheck ecosystem.**

A ~3 KB package that handles:

- Ed25519 JWT sign / verify with `jose`
- Cross-subdomain cookie serialize / clear / parse
- Typed `SessionPayload` (`sub`, `did_oc`, `jti`, …)

No React, no DB, no framework. Usable from Node, Edge, or browser.

## The model

There is **one auth host** (by convention `https://ochk.io`) that holds the
private JWK and issues tokens. Every **consumer subdomain** (`attest.ochk.io`,
`lock.ochk.io`, `docs.ochk.io`, …) only holds the public JWK and verifies
locally — no network round-trip.

The session cookie is set with `Domain=.ochk.io`, so once a user signs in on
any subdomain, every other subdomain sees them as signed-in immediately.

## Install

```bash
yarn add @orangecheck/auth-core
```

## Generate a key pair

```bash
node scripts/gen-auth-keys.mjs
# → prints OC_AUTH_KID, OC_AUTH_PRIVATE_JWK, OC_AUTH_PUBLIC_JWK
```

`OC_AUTH_PRIVATE_JWK` lives only on the auth host. The public JWK + KID go on
every subdomain.

## On the auth host

```ts
import { signSession, serializeSessionCookie } from '@orangecheck/auth-core';

const token = await signSession(
    { sub: accountId, did_oc: didOc, jti: crypto.randomUUID() },
    {
        kid: process.env.OC_AUTH_KID!,
        privateJwk: process.env.OC_AUTH_PRIVATE_JWK!,
        publicJwk: process.env.OC_AUTH_PUBLIC_JWK!,
        issuer: 'https://ochk.io',
    },
    60 * 60 * 24 * 30
);

res.setHeader(
    'Set-Cookie',
    serializeSessionCookie(token, { domain: '.ochk.io', maxAge: 60 * 60 * 24 * 30 })
);
```

## On any consumer subdomain

```ts
import { readSessionCookie, verifySessionToken } from '@orangecheck/auth-core';

const token = readSessionCookie(req.headers.cookie);
if (!token) return res.status(401).end();

const payload = await verifySessionToken(token, {
    publicJwk: process.env.OC_AUTH_PUBLIC_JWK!,
    issuer: 'https://ochk.io',
});

if (!payload) return res.status(401).end();

// payload.did_oc is the opaque user identifier (did:oc:<32-hex>).
```

## Guarantees

- **No shared secret.** Consumer apps cannot forge sessions — only the auth
  host can, because only it holds the private key.
- **Offline-verifiable.** Given the public JWK, any process can verify a
  token — no database, no auth server round-trip.
- **Stateless.** Revocation is the caller's problem. This package does
  crypto only; if you need immediate-revoke semantics, layer a DB check
  on the auth host.

## License

MIT.
