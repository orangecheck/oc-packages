# Changelog

## 0.3.2

- `oc-vault --version` prints the package's version, read from its
  package.json. It had said 0.2.0 since 0.2.0.

## 0.3.1

- Requires `@orangecheck/vault-core@^0.3.2`, so every install has its checks:
  a vault blob's scrypt work factors are checked before anything is derived
  (0.3.1), and an `ocv://` reference reads an entry type's primary field from
  the type table's own keys only (0.3.2).

## 0.3.0

- Picks up the **`env` entry type** from `@orangecheck/vault-core@^0.2.0`:
  `oc-vault read ocv://personal/<bundle>/<KEY>` resolves one var of an env
  bundle, and `ocv://personal/<bundle>` (no field) emits the whole bundle
  as `KEY=value` lines — handy for `inject`/`run`/`export` against a
  template or a CI job.

## 0.2.0

- `oc-vault export` — resolve every `ocv://` reference (from a `--env-file`
  or inherited env vars) in a single vault open and emit `KEY=value`, or,
  with `--github` (auto-detected in GitHub Actions), load them into the job
  environment via `$GITHUB_ENV` with masking. The primitive the
  `load-vault-secrets` Action is built on.

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
