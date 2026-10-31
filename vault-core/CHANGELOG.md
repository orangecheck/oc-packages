# Changelog

## [0.5.0] — 2026-10-31

### Changed

- `deviceFingerprint` compares 10 bytes of sha256(device key), not 4, in
  Crockford base32 as four groups of four: `XVER-GFD0-N52H-B4YW`, not
  `EEDD-883D`. The key a person checks before a vault key is sealed to a
  device usually comes from a server, and a server could find a key of its
  own with the same 4-byte fingerprint in about 2^32 tries; 10 bytes take
  about 2^80. Both devices must show the new form, so a device on 0.4.x and
  one on 0.5.0 show different fingerprints and the check fails safe.
  `FINGERPRINT_BYTES` is exported. `vectors/blob-v1.json`'s device-grant
  fingerprint is the new form.

## [0.4.0] — 2026-10-27

### Added

- The write side of blob format v1, so every OC Vault client runs one
  implementation: `wrapVaultKey` and `SCRYPT_PARAMS` (N = 2^17, r = 8, p = 1),
  `generateRecoveryCode` / `normalizeRecoveryCode`, `wrapKeyUnderKey` /
  `unwrapKeyUnderKey` (team keys), `sealKeyToDevice` / `openDeviceGrant` /
  `deviceFingerprint` (handing the key to another device), and
  `createEncryptedBackup` / `restoreEncryptedBackup` / `isEncryptedBackup`.
  A backup file's work factors pass `assertAcceptableKdfParams` before use.
- `vectors/blob-v1.json`, shipped with the package: a passphrase wrap, a
  recovery wrap, a key under a key, entry fields, a cloud blob, a device grant,
  a backup file, an export, and the accepted work-factor grid, as vault.ochk.io
  writes them. `src/vectors.test.ts` reads every one and writes the same shapes.
  `scripts/gen-blob-v1.vault-web.ts` is the generator that wrote it, run in
  oc-vault-web; its keys, salts and nonces are random, so the committed file
  is the pin and a rerun writes an equivalent one.
- `src/kdf-guard.test.ts`: `unwrapVaultKey` and `restoreEncryptedBackup`
  refuse out-of-range work factors before scrypt runs (a spy counts the calls).

### Changed

- The package description and docs say what the key is: 32 random bytes,
  stored only sealed under the passphrase and recovery code, and unwrapped
  in-process. They said it was derived from the passphrase.

## [0.3.2] — 2026-10-26

### Fixed

- `resolveSecretRef` reads an entry type's primary field from the table's
  own keys only. A reference to an entry whose type has no primary field
  throws `SecretRefError`, as other unresolvable references do.

## [0.3.1] — 2026-10-07

### Changed

- `unwrapVaultKey` checks a blob's scrypt work factors before deriving
  anything: N a power of two from 2^14 to 2^20, r ≤ 16, p ≤ 4. Outside that
  it throws `unsupported key-derivation parameters`, distinct from
  `WrongPassphrase`. Every blob this library has written (N = 2^17, r = 8,
  p = 1) is inside the range.
- The package declares `"sideEffects": false`.

### Added

- `assertAcceptableKdfParams(wrapped)`, the same check, for a consumer that
  wants to test a blob before using it.

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
