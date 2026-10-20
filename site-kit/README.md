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
| `./seo` | `Seo`, `createSeo(site)`, `generateMetaTags`, `jsonLd` (escapes `<` `>` `&` U+2028 U+2029), and schema.org builders: `webSite`, `organization`, `softwareApplication`, `techArticle`, `webPage`. |
| `./headers` | `siteHeaders(opts)` for next.config `headers()`, `securityHeaders`, `buildCsp`. Every CSP source is validated: no `*`, no plain http, no injected directive. Relay URLs reduce to their wss origin. |
| `./auth` | `createSessionReader`, `createMeHandler`, `refuseCookieSession` (same-site only from a listed family site), `FAMILY_ORIGINS`. |
| `./og` | `createOgHandler(card)`: the family 1200×630 card on the node runtime. |
| `./sitemap` | `writeSitemap(opts)`; also the `oc-site-kit sitemap` CLI. |

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

```json
"build": "oc-site-kit sitemap --site https://stamp.ochk.io --exclude /dashboard && next build --webpack"
```

## `/api/auth/me` answers

| Request | Answer |
|---|---|
| Signed in | `200 { ok: true, account }`, the shape `@orangecheck/auth-client` reads |
| Signed out | `200 { ok: true, account: null }`, as ochk.app answers |
| A per-tab token that does not verify, or a deleted account's | `401 { ok: false, reason }`; auth-client drops the tab's pin only on a 401, then retries on the cookie |
| Any method but GET | `405`, `Allow: GET` |

Always `Cache-Control: no-store, private` and `Vary: Cookie, X-OC-Tab-Session`.

## Peers

`next` 15 or 16, `react` 18 or 19. `@orangecheck/auth-core` ^2.5.0 for `./auth` only.

## License

MIT
