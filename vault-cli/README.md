# @orangecheck/vault-cli

`oc-vault` — your OC Vault from the shell. Resolve `ocv://` secret
references, inject secrets into a process or a config file, browse entries.

Zero-knowledge: the vault key is derived locally from your passphrase and
never leaves the process. `login` caches only ciphertext, so every other
command runs fully offline.

```sh
npm install -g @orangecheck/vault-cli

oc-vault login --cookie "<oc_session value>"   # one time — caches ciphertext
oc-vault read ocv://personal/Stripe/key        # → the API key
oc-vault read ocv://personal/GitHub/login?attr=otp   # → a live TOTP code
oc-vault run --env-file .env.ocv -- ./server   # secrets in the child's env
oc-vault inject -i config.tpl -o config.out    # fill a template
oc-vault item list
oc-vault whoami
```

The passphrase is read from `$OCV_PASSPHRASE` (for CI) or a hidden prompt.

## Commands

| Command | What it does |
|---|---|
| `login` | Authenticate to vault.ochk.io; cache the escrow + ciphertext. |
| `sync` | Refresh the cached ciphertext. |
| `read <ref>` | Resolve one `ocv://` reference, print its value. |
| `run [--env-file f] -- <cmd>` | Run a command with `ocv://` references resolved into its environment. |
| `export [--env-file f]` | Resolve `ocv://` references and emit `KEY=value` — or load them into a CI job (`--github`). |
| `inject -i <tpl> [-o <out>]` | Fill every `ocv://` reference in a template. |
| `item list` / `item get <name>` | Browse entries (secrets masked unless `--reveal`). |
| `whoami` | Show the cached identity. No passphrase needed. |

## Auth

`login` takes `--token <ocv_…>` (long-lived access tokens — vault.ochk.io
developer settings) or, as an interim, `--cookie <oc_session>` — the value
of your `oc_session` cookie from a browser session. The cached escrow and
blobs are ciphertext; the passphrase that unwraps them is never stored.

See `VAULT-DEVELOPER-PLATFORM.md` for the design and roadmap.

## License

MIT © OrangeCheck
