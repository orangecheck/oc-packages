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

Fetch the poll and all ballots from Nostr, verify every BIP-322 signature, look up UTXO state at the declared snapshot block from mempool.space, and run the pure tally function. Output matches what any conforming implementation produces.

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

- `--relay wss://...` (repeatable) — custom relay set. Defaults to the canonical four.
- `--mempool-base https://...` — UTXO source. Defaults to `https://mempool.space/api`.
- `--snapshot <height>` — pin a specific snapshot block (overrides `poll.snapshot_block`).
- `--no-verify` — skip BIP-322 checks (faster, less safe — use only for sanity probes).
- `--json` — JSON output instead of the human-readable bar chart.

### `oc-vote verify <poll_id>`

Verify every BIP-322 signature on the poll and on each ballot. Prints a short summary; `--json` gives per-ballot details.

### `oc-vote show <poll_id>`

Print the poll metadata + ballot count without running the tally. Useful for quickly inspecting a poll.

## Why

The web UI at [vote.ochk.io](https://vote.ochk.io) is convenience. The canonical tally is whatever the spec's pure function produces. If the web UI ever disagrees with what this CLI outputs, **the CLI is correct** and the UI has a bug — file an issue with the diff.

## Related

- Protocol: [`orangecheck/oc-vote-protocol`](https://github.com/orangecheck/oc-vote-protocol)
- Reference web client: [`orangecheck/oc-vote-web`](https://github.com/orangecheck/oc-vote-web)
- Library: [`@orangecheck/vote-core`](https://npmjs.com/package/@orangecheck/vote-core)

## License

MIT.
