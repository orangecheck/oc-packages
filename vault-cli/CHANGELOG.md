# Changelog

## Unreleased

## 0.3.6

- A command that asks for the vault passphrase takes the first line of stdin, a
  last line with no newline included, and exits 1 with
  `No passphrase given: input closed before a line.` when stdin ends before one.
  With 0.3.5 it exited 0 having done nothing, so `oc-vault run` in a script ran
  no command and reported success. Input is still masked, and an empty line
  still exits 1 with `No passphrase given.`
- The passphrase prompt is written to stderr, so `oc-vault read`, `inject`,
  `export` and `item` put only their output on stdout. When stdin is a
  terminal, every character typed shows as `*`, each time the line is drawn,
  and the terminal echoes nothing itself. Ctrl-C at the prompt exits 1 with
  `No passphrase given: interrupted.`

## 0.3.5

- Runs on vault-core 0.6.0, which tells a blob that couldn't be read from
  one deleted since the listing. `sync` and `login` still write nothing when
  any listed entry couldn't be fetched, and say how many. A blob deleted
  since the listing is now left out, and the rest is cached, instead of
  failing the pull.
- A session that ends or sync that stops being paid partway through a pull
  is said as itself (`not signed in to vault.ochk.io`), not as entries that
  couldn't be fetched. Nothing is cached.

## 0.3.4

- `sync` and `login` write the cache only when every listed entry was
  fetched. A blob that couldn't be read (a 401, 402, 429, 5xx or network
  error) was left out before, and `Synced · N entries.` then replaced the
  cache with the shorter set, so those entries were gone offline. Now `sync`
  keeps the cache it had, `login` caches nothing, and each exits 1 saying how
  many entries were missed.

## 0.3.3

- **Security:** `oc-vault export --github` masks every line of a multi-line
  secret. GitHub reads `::add-mask::` one line at a time, so 0.2.0 through
  0.3.1 masked only the first line of a value such as a PEM or SSH key, and
  printed the rest into the job log in clear. Each non-empty line now gets
  its own mask, escaped as the runner reads command data, before anything is
  written. A line ends where the runner ends a log line: at `\r\n`, `\n` or a
  lone `\r`. **If you ran `export --github` (or `export` in a GitHub Actions
  job) on 0.2.0–0.3.1 with a multi-line secret, rotate that secret and
  delete the affected run logs.**
- The README says what prints values unmasked: `export` without `--github`
  (`KEY=value`), and `read` and `inject` to stdout, in any mode.
- Includes 0.3.2's change, which was never published.

## 0.3.2 (not published; ships in 0.3.3)

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
