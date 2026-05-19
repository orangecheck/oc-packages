# Changelog

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
