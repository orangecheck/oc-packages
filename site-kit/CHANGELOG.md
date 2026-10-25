# Changelog

## 0.7.0

`hostOf(ip)` in `@orangecheck/site-kit/rate`: the one requester behind an
address, for a per-person cap under a network's. An IPv4 address is itself, and
so is an IPv4-mapped IPv6 address, written dotted or in hex; any other IPv6
address is its /64. It reads the address as `networkOf` does, so a host always
lies inside its network, and text that is no address is `other:` and the
trimmed text under both. Held to `host_of` in `test-vectors/network-key.json`,
from the same independent reference.

## 0.6.0

New entry `@orangecheck/site-kit/rate`, server only: `networkOf(ip)`,
`keyedId(secret, purpose, kind, value)` and `networkKey(ip, secret, purpose)`,
the rule each site's network caps count by. An IPv4 address is its /24 and so
is an IPv4-mapped IPv6 address, written dotted or in hex; any other IPv6
address is its /48. An octet past 255 or with a leading zero, a second `::`, a
group of more than four digits, a zone id or a port is no address, and counts
as its own network. Held to `test-vectors/network-key.json`, written by an
independent reference.

## 0.5.4

`FAMILY_ORIGINS` and `isFamilyOrigin` in `@orangecheck/site-kit/auth` are now
the ones `@orangecheck/auth-core/family-origins` keeps, re-exported: same names,
same answers, one list, with one difference: localhost counts as family only
when `NODE_ENV` is `development` or `test`, not when it is unset. The optional
peer on `@orangecheck/auth-core` is `^2.21.0`, the first release with that
entry.

## 0.5.3

The share card draws only text the site issues. `createOgHandler` no longer
reads `?title=` or `?eyebrow=`: with no `cards` every request gets the site's
default card, and with `cards: { key: title }` (or `{ title, eyebrow }`)
`?page=<key>` draws that card, an own key of the map only. `ogTitle` reads the
same way, so a route built on it is covered too. `ogEyebrow` is gone; no site
imported it.

`siteOgImage` emits `?page=<key>` for a page whose card title is one of the
site's `ogCards`, and the bare route for every other page. A site restores its
per-page cards by giving the same map to `defineSite({ ogCards })` and
`createOgHandler({ cards })`.

## 0.5.2

`createOgHandler` takes `?eyebrow=`, the line above the title, cut to 80
characters, over the site's own `eyebrow`. A page can name its section
explicitly (ochk.io's protocol pages put the verb there) rather than have it
guessed from the title.

## 0.5.1

`cardTitle` takes anything with a `name`, so a site that keeps its own Seo can
cut its name from a page title the same way when it points og:image at its card.

## 0.5.0

A page's link preview is the family card with its own title. A site that
serves `createOgHandler` sets `ogRoute: '/api/og'`, and every page's
`og:image` and `twitter:image` become `${url}/api/og?title=<title>`, the
site's name cut from the title since the card shows it. `ogImage` also takes
a function of the title. A page's own `ogImage` still wins.

Breaking: `canonical` is required on every page, and `url` on
`webPage`, `techArticle` and `softwareApplication`. They fell back to the
site root, which now redirects on every tool site; a page without one throws.
`absoluteUrl` no longer takes `undefined`.

## 0.4.0

`createOgHandler` draws app-design's share card (`@orangecheck/app-design/og`:
`OgCard`, `ogFonts()`, `OG_SIZE`), so the route stays here and the frame and
fonts come from the design system. Same handler, same `?title=`, same cache
headers. New options `product`, `eyebrow` and `tone`; a 0.3 `wordmark` such as
`oc·stamp` still gives the word `stamp` and the eyebrow `OC Stamp`, and `host`
is shown in lower case. `mark`, `badge`, `footer`, `markTop` and
`wordmarkLeft` are ignored. Needs `@orangecheck/app-design` ^1.10.1 in the
site. site-kit's own `OgCard` export is gone.

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
