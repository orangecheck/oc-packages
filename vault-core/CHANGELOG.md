# Changelog

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
