# @orangecheck/site-kit

Family-internal scaffolding for the `.ochk.io` Next.js sites (Pages Router).
**Not for third-party integration.**

Every family site carried its own copy of the same SEO helper, security
headers, `/api/auth/me` route, OG card and sitemap script. On 2026-10-20 an
unescaped JSON-LD helper had to be fixed in ten repos, and two copies were
exploitable. This package holds one copy, so a family fix is a version bump.
Each site keeps its own deploy and passes its own values.

## Entries

| Entry | What it gives a site |
|---|---|
| `./seo` | `Seo`, `createSeo(site)`, `generateMetaTags`, `jsonLd` (escapes `<` `>` `&` U+2028 U+2029), and schema.org builders: `webSite`, `organization`, `softwareApplication`, `techArticle`, `webPage`. Every page names its `canonical`. A site with `ogRoute: '/api/og'` shares the route's default card, or `?page=<key>` for a page whose card title is one of its `ogCards`. No title rides the URL. |
| `./headers` | `siteHeaders(opts)` for next.config `headers()`, `securityHeaders`, `buildCsp`. Every CSP source is validated: no `*`, no plain http, no injected directive. Relay URLs reduce to their wss origin. |
| `./auth` | `createSessionReader`, `createMeHandler`, `refuseCookieSession` (same-site only from a listed family site), `FAMILY_ORIGINS`. |
| `./og` | `createOgHandler(card)`: app-design's 1200×630 share card on the node runtime. It draws only cards the site issues: `?page=<key>` from its `cards` map (a title, or `{ title, eyebrow }`), the default card for anything else. A request's own text is never drawn. Needs `@orangecheck/app-design` ^1.10.1. |
| `./sitemap` | `writeSitemap(opts)`; also the `oc-site-kit sitemap` CLI. |
| `./analytics` | `FamilyAnalytics` for `_document`, `useFamilyPageviews()` for `_app`, `familyPageUrl(href)`. Plausible and oc-pulse see each page as origin and path with its campaign tags, never its query or fragment. |

## Usage

```ts
// next.config.ts
import { siteHeaders } from '@orangecheck/site-kit/headers';
const nextConfig = {
    async headers() {
        return siteHeaders({ csp: { connect: ['https://ochk.io'], relays: DEFAULT_RELAYS }, camera: 'self' });
    },
};
```

```ts
// src/pages/api/auth/me.ts
import { createMeHandler, createSessionReader } from '@orangecheck/site-kit/auth';
export default createMeHandler({ reader: createSessionReader() });
```

```tsx
// src/pages/_document.tsx, inside <Head>
import { FamilyAnalytics } from '@orangecheck/site-kit/analytics';
<FamilyAnalytics />

// src/pages/_app.tsx
import { useFamilyPageviews } from '@orangecheck/site-kit/analytics';
useFamilyPageviews();
```

```json
"build": "oc-site-kit sitemap --site https://stamp.ochk.io --exclude /dashboard && next build --webpack"
```

## `/api/auth/me` answers

| Request | Answer |
|---|---|
| Signed in | `200 { ok: true, account }`, the shape `@orangecheck/auth-client` reads |
| Signed out | `200 { ok: true, account: null }`, as ochk.app answers |
| A per-tab token that does not verify, or an ended session's | `401 { ok: false, reason }`; auth-client drops the tab's pin only on a 401, then retries on the cookie |
| A cookie for a session the auth host has ended | `200 { ok: true, account: null }`: signed out |
| Any method but GET | `405`, `Allow: GET` |

Always `Cache-Control: no-store, private` and `Vary: Cookie, X-OC-Tab-Session`.

## Ended sessions

The reader refuses a session the auth host has ended (signed out, replaced,
cut off with every session of its account, or deleted). It asks
`ochk.io/api/auth/revocations` at most once a minute, with the site's own
`OC_REVOCATION_FEED_TOKEN` (set by `scripts/revocation_feed_tokens.py` in the
workspace). If the list cannot be refreshed for 10 minutes, reads still pass
and writes are refused with reason `unverified`. Without the token, a
production site refuses every write on a session.

## Analytics

A page's query and fragment can hold values only that page should read.
Plausible's scripts send `location.href` and the full `document.referrer`
with every event, and its hash script records the fragment as part of the
page. So the kit sends Plausible's events itself, through the site's
first-party `/oc-insights/event` proxy: the page as origin and path with
`utm_*` and `ref`, a referrer as its origin and only from another site.
`window.plausible` keeps working for custom events and Plausible's "Outbound
Link: Click" (the target's origin and path). `plausible_ignore` and
automation are honoured as Plausible's script honours them. What it drops:
Plausible's engagement events (time on page, scroll depth). oc-pulse already
sends origin and path.

## Peers

`next` 15 or 16, `react` 18 or 19. `@orangecheck/auth-core` ^2.9.0 for `./auth` only.

## License

MIT
