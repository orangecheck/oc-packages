# `@orangecheck/auth-core`

> **Full reference:** [ochk.io/docs/sdk/auth-core](https://ochk.io/docs/sdk/auth-core) — auto-generated from the TypeScript source on every release.
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
`lock.ochk.io`, `stamp.ochk.io`, …) only holds the public JWK and verifies
locally — no network round-trip.

The session cookie is set with `Domain=.ochk.io`, so once a user signs in on
any subdomain, every other subdomain sees them as signed-in immediately.

## Install

```bash
yarn add @orangecheck/auth-core
```

## Generate a key pair

The auth host signs with an Ed25519 (EdDSA) key. This package ships no
generator: make the pair with `jose` (`generateKeyPair` with
`extractable: true`, then `exportJWK` on each half), pick a short KID, and set
`OC_AUTH_KID`, plus each JWK's JSON base64url-encoded as `OC_AUTH_PRIVATE_JWK`
and `OC_AUTH_PUBLIC_JWK`.

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

A signed-out token still verifies. Family sites also ask the auth host's list
of ended sessions, cached for a minute per process:

```ts
import { familyRevocationCheck } from '@orangecheck/auth-core';

// Reads OC_REVOCATION_FEED_TOKEN. Refuses a revoked session, and refuses
// writes (not reads) while the list cannot be refreshed for 10 minutes.
if (await familyRevocationCheck().refuses(payload, req.method)) {
    return res.status(401).end();
}
```

A site that holds a person's data (an account, money, messages, secrets)
stops reads too while the list can't vouch for a session, and says why:

```ts
import { refusesEvenReads } from '@orangecheck/auth-core';

const refused = await refusesEvenReads(payload);
if (refused === 'unverified') {
    // The auth host can't be reached: not signed out. Try again shortly.
    res.setHeader('Retry-After', '60');
    return res.status(503).json({ ok: false, reason: 'session_unverified' });
}
if (refused) return res.status(401).end();
```

Such a site shows its feed on a health route, so a signed-out GET can see
that it checks sessions before it stops reads:

```ts
import { revocationFeedState } from '@orangecheck/auth-core';

// 'live', 'unverified' or 'no-token': no secret, no count.
res.status(200).json({ status: 'ok', revocation_feed: await revocationFeedState() });
```

## Relay assertions (server only)

A relay, such as the owner cockpit, acts on another site for an owner who
stepped up to it moments ago. For each write it signs a relay assertion: an
Ed25519 compact JWS (`typ` `oc-relay+jwt`, `alg` `EdDSA`) naming the site,
the owner, when they stepped up, the method, the path with its query, and the
SHA-256 of the body's RFC 8785 canonical JSON. It lives at most 60 s, the
site allows its `iat` at most 5 s of clock skew, and the site spends its `jti`
once.

```ts
import { RELAY_ASSERTION_HEADER, signRelayAssertion } from '@orangecheck/auth-core/relay-assertion';

const path = '/api/admin/example?id=1';
const body = JSON.stringify(payload);
const assertion = await signRelayAssertion({
    privateJwk: process.env.RELAY_SIGNING_JWK!, // base64url JWK
    kid: 'relay-1',
    audience: 'https://me.ochk.io',
    actor: owner.did_oc,
    sudoAt: owner.sudo_at,
    request: { method: 'POST', path, wireBody: body },
});
await fetch(`https://me.ochk.io${path}`, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', [RELAY_ASSERTION_HEADER]: assertion },
});
```

On the site:

```ts
import { RELAY_ASSERTION_HEADER, verifyRelayAssertion } from '@orangecheck/auth-core/relay-assertion';

const result = await verifyRelayAssertion({
    token: String(req.headers[RELAY_ASSERTION_HEADER] ?? ''),
    publicJwks: process.env.RELAY_PUBLIC_JWKS!, // base64url JWKS, each key with a kid
    audience: 'https://me.ochk.io',
    actor: String(req.headers['x-oc-actor-did'] ?? ''),
    request: { method: req.method!, path: req.url!, body: req.body },
    maxSudoAgeSeconds: 300, // the site's step-up window; required
    // Resolve true the first time, false after; throw when the store cannot answer.
    claimJti: (jti, exp) => store.setIfAbsent(`relay-jti:${jti}`, exp),
});
if (!result.ok) return res.status(result.reason === 'store_unavailable' ? 503 : 401).end();
```

- The key comes from the site's own JWKS by `kid`. A token that names a key
  of its own (`jwk`, `jku`, `x5u`, `x5c`, `x5t`) or carries `crit` is refused.
- The signed path is `relayRequestTarget(path)`: the path as sent, with its
  query re-serialized as `URLSearchParams` writes it, the form Next.js gives a
  route in `req.url`. The site compares the claim to `relayRequestTarget` of its
  own request target, so either form verifies and a changed query does not.
  Only an origin-form target counts: a single leading `/`, visible ASCII and
  no `#`. The signer throws on any other, and the site refuses one as
  `request_mismatch`.
- The relay hashes `JSON.parse` of the exact string it sends; the site hashes
  the body as it parsed it. No body (`undefined`, `null` or `''`) hashes the
  empty string, and `{}` hashes `"{}"`.
- Every check runs before the `jti` is spent, so a refused assertion spends
  nothing.
- An owner who stepped up longer ago than `maxSudoAgeSeconds` is refused as
  `sudo_stale`. A `sudo_at` later than the assertion's `iat` is malformed, and
  the signer refuses a `sudoAt` later than now.
- This entry uses `node:crypto` and `@orangecheck/stamp-core`'s canonicalizer.
  The main entry and the browser entries load neither.

## Guarantees

- **No shared secret.** Consumer apps cannot forge sessions — only the auth
  host can, because only it holds the private key.
- **Offline-verifiable.** Given the public JWK, any process can verify a
  token — no database, no auth server round-trip.
- **No call per request.** Verification is crypto only. The revocation
  check fetches the auth host's list at most once per minute per process
  and answers from memory.
- **Unknown options throw.** Every verifier, the signer and the revocation
  checks refuse a key they do not read, so a misspelt `audience` is never
  read as no audience.

## License

MIT.
