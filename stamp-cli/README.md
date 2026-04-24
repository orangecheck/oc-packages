# @orangecheck/stamp-cli

Shell interface to [OC Stamp](https://github.com/orangecheck/oc-stamp-protocol). Two binaries from one package:

- **`stamp`** — sign files, verify envelopes, anchor to Bitcoin, dry-run canonical messages.
- **`git-stamp`** — stamp git tags. Replaces the GPG dance for release signing.

## Install

```sh
npm i -g @orangecheck/stamp-cli
```

## `stamp` — file stamping

```sh
# Sign a file. Prints the canonical message, prompts for a BIP-322 signature
# from your wallet, writes <path>.stamp alongside, submits to OTS calendars.
$ stamp file blogpost.md --addr bc1qalice...

# Non-interactive (sig pre-computed elsewhere):
$ stamp file blogpost.md --addr bc1qalice... --sig '...'

# Skip anchoring (sign only):
$ stamp file blogpost.md --addr bc1qalice... --no-anchor

# Dry run — print what would be signed, don't sign:
$ stamp canonical blogpost.md --addr bc1qalice...

# Verify a stamp:
$ stamp verify blogpost.md.stamp blogpost.md --require-anchor

# Retry anchoring on an existing stamp:
$ stamp anchor blogpost.md.stamp
```

## `git-stamp` — release/tag signing

```sh
# Tag + stamp:
$ git tag v2.1.0 -m 'release'
$ git-stamp tag v2.1.0 --addr bc1qalice...

# Later, anyone verifies:
$ git-stamp verify v2.1.0 --require-anchor
```

The stamp is stored at `.git/stamps/<tag>.stamp` — co-located with the repo, discoverable by `git-stamp verify` without a separate config.

The signing domain covers the tag's tree hash, the tag object id, and the tag name. Changing any of them invalidates the stamp.

## `stamp verify` — full SPEC §8 checks

```
$ stamp verify blogpost.md.stamp blogpost.md --json
{
  "ok": true,
  "id": "f0dd79a528ab2c75...",
  "signer": "bc1qalice...",
  "signed_at": "2026-04-24T18:30:00Z",
  "content_hash": "sha256:a4c8f7d2...",
  "content_mime": "text/markdown",
  "content_length": 12843,
  "content_checked": true,
  "anchor": "confirmed at block 890123",
  "signature_checked": true,
  "stake": null
}
```

On failure, exits `2` with an error code:

```
$ stamp verify blogpost.md.stamp other-content.md --json
{ "ok": false, "code": "E_BAD_CONTENT", "message": "..." }
```

## `--json` output

All commands accept `--json` for machine-readable output. Exit codes: `0` success, `1` user error (bad input), `2` verification failure.

## How the signing flow works

BIP-322 signing in a CLI can't drive every wallet the way the browser can. `stamp-cli` takes the explicit approach: print the canonical message, let you sign it with whatever wallet you have (UniSat, Xverse, Leather, Sparrow, Electrum, `bitcoind signmessage`, etc.), paste the signature back.

```
$ stamp file blogpost.md --addr bc1qalice...

Sign this message with your Bitcoin wallet (BIP-322):

────────────────────────────────────────────────────────────
oc-stamp:v1
address: bc1qalice...
content_hash: sha256:a4c8f7d2...
content_length: 12843
content_mime: text/markdown
signed_at: 2026-04-24T18:30:00Z
────────────────────────────────────────────────────────────

paste signature (base64): _
```

For automation, pass `--sig <base64>` to skip the prompt entirely.

## Spec

- [SPEC.md](https://github.com/orangecheck/oc-stamp-protocol/blob/main/SPEC.md)
- [Canonical message format (SPEC §3)](https://github.com/orangecheck/oc-stamp-protocol/blob/main/SPEC.md#3-canonical-message)
- [Verification algorithm (SPEC §8)](https://github.com/orangecheck/oc-stamp-protocol/blob/main/SPEC.md#8-verification-algorithm)

## License

MIT.
