# Changelog

## 0.3.2

`useFamilyPageviews` counts a page the way oc-pulse and Plausible's own script
do: a new path reached with `pushState` or `popstate`. 0.3.1 also counted a
`replaceState` to another path and a change of campaign tag on the same path,
which oc-pulse does not, so the two lanes drifted apart on those navigations.

## 0.3.1

`useFamilyPageviews` follows the address (`history.pushState`, `replaceState`
and `popstate`) instead of Next's router, so `./analytics` imports nothing from
Next. 0.3.0 imported `next/router.js`: Next loads site-kit outside its bundle
on the server, where that is a second copy of the router's module, and a bare
`next/router` does not resolve under Node's ESM loader. `yarn test` now builds
and starts a Next site whose `_app` uses the hook and asks a static page and a
`getServerSideProps` page for a 200, and refuses any Next import in the built
entry.

## 0.3.0

`./analytics`: `FamilyAnalytics` (the `_document` scripts), `useFamilyPageviews`
(`_app`) and `familyPageUrl`. Plausible events leave as origin and path with
campaign tags, and a referrer as its origin from another site only, never a
page's query or fragment. Custom events and outbound-link clicks go through
the same path. Plausible's engagement events are no longer sent.

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
