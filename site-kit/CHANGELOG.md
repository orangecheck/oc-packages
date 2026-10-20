# Changelog

## 0.2.0

`createSessionReader` checks every verified session against the auth host's
list of ended sessions (auth-core `familyRevocationCheck`, which reads
`OC_REVOCATION_FEED_TOKEN`), so a signed-out, replaced or purged token stops
working within a minute. A revoked session reads as signed out; while the list
cannot be refreshed, a write answers the new reason `unverified` and reads
pass. Pass `revocation` to supply another check, or `false` in a test.

Breaking: `isRevoked` receives the whole verified payload, not the did. Needs
`@orangecheck/auth-core` ^2.9.0.

## 0.1.1

`FAMILY_ORIGINS` no longer lists https://docs.ochk.io: the docs are served at
ochk.io/docs and docs.ochk.io only redirects (matches oc-www a0e14a7).

## 0.1.0

First release: `./seo`, `./headers`, `./auth`, `./og`, `./sitemap` and the
`oc-site-kit` CLI, extracted from the copies in the family sites. Where copies
differed on a security property, the kit takes the strictest: JSON-LD escapes
`>`, `&`, U+2028 and U+2029 as well as `<`; HSTS is two years; a same-site
cookie session is accepted only from a listed family origin; CSP sources are
validated. Signed out, `/api/auth/me` answers 200 with a null account.
