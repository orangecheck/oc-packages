# Changelog

## [0.3.0] — 2026-09-03

### Security

- **`matchEntryToPage` offered a credential across shared-hosting tenants.**
  `registrableDomain` had a 12-entry multi-label-suffix set and returned the
  last two labels for anything else, so `alice.github.io` and
  `attacker.github.io` both reduced to `github.io` — the match came back
  `'registrable'` ("offer this credential, ranked lower") and a vault client
  would autofill alice's credential on the attacker's page. The same held for
  `vercel.app`, `netlify.app`, `pages.dev`, `workers.dev`, `herokuapp.com`,
  `blogspot.com`, `wordpress.com`, `myshopify.com`, `web.app`,
  `azurewebsites.net`, `atlassian.net`, `sharepoint.com` and every
  second-level ccTLD outside the original list (`co.il`, `com.tr`, `co.kr`,
  `com.cn`, `com.tw`, …).

  The docstring claimed the function "falls back to the full host when the
  suffix is unknown (**stricter, never looser**)". It returned the last two
  labels — the opposite. The comment described the property the code should
  have had, which is the worst kind of comment to have.

  The suffix set now covers the shared-hosting suffixes (where every customer
  is a sibling subdomain, so the exposure is real) plus the common ccTLD second
  levels, and the docstring says plainly that this is still an approximation of
  the Public Suffix List and that `'exact'` is what to require for anything
  sensitive.

  `origin.test.ts` is written against the suffixes that were MISSING — 25 cases
  that all returned `'registrable'` before and return `'none'` now, plus the
  legitimate matches (`www.` vs bare, a real `co.uk`, an identical origin, a
  tenant's own pages, and the https→http downgrade refusal) to prove the fix is
  not simply stricter everywhere. Reverting to the 12-entry list fails 25 of
  them.

  The same file is duplicated in `oc-vault-extension/lib/origin.ts` — the copy
  that actually performs autofill — and is fixed there in the same change.

## 0.2.0

- New entry type **`env`** — a bundle of environment variables. Each var is
  addressable as `ocv://personal/<bundle>/<KEY>`, and a reference without a
  field (`ocv://personal/<bundle>`) emits the whole bundle as `KEY=value`
  lines — the natural shape for `.env` files and CI config. Fills the gap
  that `kv` (one pair per entry) and `file` (an opaque blob) leave open.

## 0.1.0

Initial release — Phase 1 of the OC Vault developer platform.

- Conformance-pinned crypto: vault-key unwrap (scrypt `N=2^17`), the
  double-encrypted cloud-blob envelope, and entry field encryption — the
  canonical implementation oc-vault-web and oc-vault-extension consume.
- The typed entry / field model and metadata projection.
- The `ocv://` secret-reference scheme — `parseSecretRef`,
  `resolveSecretRef`, with `?attr=otp` live-TOTP resolution.
- `VaultClient` — a transport-agnostic vault.ochk.io API client (bearer
  token or cookie auth, injectable `fetch`).
- Portable-export parsing and the `OcVault` facade.
