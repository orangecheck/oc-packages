# @orangecheck/vote-cli

Command-line tool for [OC Vote](https://github.com/orangecheck/oc-vote-protocol).

```bash
npm i -g @orangecheck/vote-cli
```

or run one-shot:

```bash
npx -y @orangecheck/vote-cli tally <poll_id>
```

## Commands

### `oc-vote tally <poll_id>`

Fetch the poll and all ballots from Nostr, verify every BIP-322 signature, look up UTXO state at the declared snapshot block from mempool.space, and run the pure tally function. In an anchored poll (deadline on or after 2026-11-15T00:00:00Z) it also reads every OC Stamp over each ballot and checks each anchor against block headers itself, and says whether the count is final or provisional. Output matches what any conforming implementation produces.

It counts only from a complete ballot read: all but one of the relays asked (4 of the 5 defaults) must finish it, and none may cut its answer short. Otherwise a clock-dated poll's tally says it can't count and exits non-zero, and an anchored poll's count stays provisional and says why.

```
$ oc-vote tally 3054390f047f2703186943a41178bc15931500b5139229517f26e56282026ee5

  poll:       Do we ship?
  poll_id:    3054390f…026ee5
  creator:    bc1q…
  mode:       public
  weight:     sats
  threshold:  100000 sat / 30 d
  deadline:   2026-05-08T00:00:00Z
  snapshot:   900412
  ballots:    47

  STATE:      tallied
  turnout:    47 voters, weight 2,814,300,000

  Ship it     ████████████··················    1,102,900,000   39.2%
  Hold        ████████··············          812,300,000   28.9%
  …
```

Flags:

- `--relay wss://...` (repeatable) — custom relay set. Defaults to the five in `@orangecheck/nostr-core`'s `DEFAULT_RELAYS`.
- `--mempool-base https://...` — UTXO source. Defaults to `https://mempool.space/api`.
- `--snapshot <height>` — pin a specific snapshot block (overrides `poll.snapshot_block`).
- `--no-verify` — skip BIP-322 checks (faster, less safe — use only for sanity probes).
- `--json` — JSON output instead of the human-readable bar chart.

### `oc-vote vote --poll <poll_id> --voter <address> --option <id>`

Build the ballot, have it signed (`--sig`, or paste a BIP-322 signature of the printed ballot_id), publish it, then ask each relay alone for it back. The ballot is in only once at least 2 relays serve a copy whose ballot signature and Nostr signature both hold; an OK from a relay is not enough. Below that it says the ballot isn't in yet, prints the signed event, and exits 2. In an anchored poll its stamp is read back the same way.

- `--json` — `in`, `served_by`, `asked`, `quorum` and the signed `event`.

### `oc-vote create` and `oc-vote reveal`

The same read-back for a poll and a reveal: published only once at least 2 relays serve back a copy that verifies. Below that each says so, prints the signed event, and exits 2. `reveal` run again sends a reveal already signed and on a relay to the relays that lack it, with nothing new to sign.

### `oc-vote republish <file>`

Send a signed poll, ballot, reveal or ballot stamp again, as it is, from an `event:` line or `--json` output. Nothing new is signed, so a poll keeps its id. Same read-back, same exit status: 0 once it is in, 2 while it isn't.

### `oc-vote verify <poll_id>`

Verify every BIP-322 signature on the poll and on each ballot. Prints a short summary; `--json` gives per-ballot details.

### `oc-vote show <poll_id>`

Print the poll metadata + ballot count without running the tally. Useful for quickly inspecting a poll.

## Why

The web UI at [vote.ochk.io](https://vote.ochk.io) is convenience. The canonical tally is whatever the spec's pure function produces. If the web UI ever disagrees with what this CLI outputs, **the CLI is correct** and the UI has a bug — file an issue with the diff.

## Related

- Protocol: [`orangecheck/oc-vote-protocol`](https://github.com/orangecheck/oc-vote-protocol)
- Reference web client: [vote.ochk.io](https://vote.ochk.io) (closed-source)
- Library: [`@orangecheck/vote-core`](https://npmjs.com/package/@orangecheck/vote-core)

## License

MIT.
