# Changelog

## 0.1.0

First release: `./seo`, `./headers`, `./auth`, `./og`, `./sitemap` and the
`oc-site-kit` CLI, extracted from the copies in the family sites. Where copies
differed on a security property, the kit takes the strictest: JSON-LD escapes
`>`, `&`, U+2028 and U+2029 as well as `<`; HSTS is two years; a same-site
cookie session is accepted only from a listed family origin; CSP sources are
validated. Signed out, `/api/auth/me` answers 200 with a null account.
