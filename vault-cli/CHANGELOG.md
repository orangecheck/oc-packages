# Changelog

## 0.1.0

Initial release — Phase 2 of the OC Vault developer platform.

- `oc-vault login` / `sync` — authenticate to vault.ochk.io and cache the
  escrow + ciphertext blobs locally (nothing plaintext at rest).
- `oc-vault read` — resolve one `ocv://` secret reference.
- `oc-vault run` — run a command with `ocv://` references resolved into its
  environment, from a `.env` file or inherited env vars.
- `oc-vault inject` — fill `ocv://` references in a config template.
- `oc-vault item list` / `item get` — browse entries; secrets masked.
- `oc-vault whoami` — show the cached identity.

Built on `@orangecheck/vault-core`. The vault key is derived locally from
the passphrase and never leaves the process.
