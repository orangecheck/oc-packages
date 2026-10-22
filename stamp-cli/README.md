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
# Sign a file. Shows the canonical message and the id, prompts for a BIP-322
# signature of the id from your wallet, writes <path>.stamp alongside, and
# submits to OTS calendars.
$ stamp file blogpost.md --addr bc1qalice...

# Non-interactive: print the id, sign it elsewhere, then pass the signature
# with the same signed-at time.
$ stamp canonical blogpost.md --addr bc1qalice... --signed-at 2026-04-24T18:30:00Z --id
$ stamp file blogpost.md --addr bc1qalice... --signed-at 2026-04-24T18:30:00Z --sig '...'

# Skip anchoring (sign only):
$ stamp file blogpost.md --addr bc1qalice... --no-anchor

# Dry run — print what would be signed, don't sign:
$ stamp canonical blogpost.md --addr bc1qalice...

# Verify a stamp:
$ stamp verify blogpost.md.stamp blogpost.md --require-anchor

# Anchor an existing stamp, or upgrade its pending proof once the
# calendars have reached a block (rewrites the .stamp only on change):
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
  "anchor": "confirmed at block 890123 (checked against the block header)",
  "anchor_state": "anchored",
  "signature_checked": true,
  "stake_declared": null,
  "stake_checked": false
}
```

`stake_declared` is the envelope's `stake` as written. It sits outside the id
and the signature, so `verify` does not vouch for it: `stake_checked` is always
`false`. Re-resolve the attestation and run `checkStake` from
`@orangecheck/stamp-core` if the stake matters to you.

A `.stamp` file is read through `parseStamp`, so a file whose fields are not
in a stamp's form exits 1 naming the field.

A confirmed anchor is checked per SPEC §6.3: the proof must commit to the
stamp id, and the block header at the claimed height (from
`--headers-url`, default `https://mempool.space/api`) must hash to the claimed
block hash and carry the proof's Merkle root. A proof that does not chain
exits 2 with `E_BAD_ANCHOR`. If no header can be fetched the claim is reported
as unverified, and `--require-anchor` fails.

On failure, exits `2` with an error code:

```
$ stamp verify blogpost.md.stamp other-content.md --json
{ "ok": false, "code": "E_BAD_CONTENT", "message": "..." }
```

## `--json` output

All commands accept `--json` for machine-readable output. Exit codes: `0` success, `1` user error (bad input), `2` verification failure.

## How the signing flow works

BIP-322 signing in a CLI can't drive every wallet the way the browser can. `stamp-cli` takes the explicit approach: show what the stamp commits to and its id, let you sign the id with whatever BIP-322 wallet you have, paste the signature back. The wallet signs the 64-character id, never the message (SPEC §4.5), and the CLI checks the signature over the id before it writes anything.

```
$ stamp file blogpost.md --addr bc1qalice...

This stamp commits to:

────────────────────────────────────────────────────────────
oc-stamp:v1
address: bc1qalice...
content_hash: sha256:a4c8f7d2...
content_length: 12843
content_mime: text/markdown
signed_at: 2026-04-24T18:30:00Z
────────────────────────────────────────────────────────────

Sign this id with bc1qalice... (BIP-322):

f0dd79a528ab2c756c1ba1aa5f350c4fdd1073e90ae447bd9438f6a7794e1485

paste signature (base64): _
```

For automation, pass `--sig <base64>` (and `--signed-at`) to skip the prompt; `stamp canonical --id` prints the id to sign.

## Spec

- [SPEC.md](https://github.com/orangecheck/oc-stamp-protocol/blob/main/SPEC.md)
- [Canonical message format (SPEC §3)](https://github.com/orangecheck/oc-stamp-protocol/blob/main/SPEC.md#3-canonical-message)
- [Verification algorithm (SPEC §8)](https://github.com/orangecheck/oc-stamp-protocol/blob/main/SPEC.md#8-verification-algorithm)

## License

MIT.
