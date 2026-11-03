# `@orangecheck/airdrop-gate`

> **Full reference:** [ochk.io/docs/sdk/airdrop-gate](https://ochk.io/docs/sdk/airdrop-gate) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


**Sybil filter for token airdrops.**
Turn a candidate address list into a sybil-resistant allowlist backed by real Bitcoin stake.

```bash
yarn add @orangecheck/airdrop-gate
```

Reference implementation for VISION pathway 3's second half. Every distribution that runs through this filter requires attackers to lock Bitcoin per-wallet — ruinous at sybil scale; trivial for real users.

---

## Library API

```ts
import { filterAllowlist } from '@orangecheck/airdrop-gate';

const { ok, rejected, unread } = await filterAllowlist(candidates, {
    minSats: 100_000,
    minDays: 30,
    concurrency: 8,
    onProgress: (done, total) => console.log(`${done}/${total}`),
});

// `ok` is your final allowlist (addresses, in input order).
// `rejected` explains why each excluded address was dropped.
// `unread` lists the addresses nothing could be concluded about: decide on them yourself.
```

### `filterAllowlist(addresses, options?)`

| Option          | Default      | Notes                                                                                    |
| --------------- | ------------ | ---------------------------------------------------------------------------------------- |
| `minSats`       | `0`          | Minimum sats bonded.                                                                     |
| `minDays`       | `0`          | Minimum days unspent.                                                                    |
| `concurrency`   | `4`          | Parallel `check()` calls. The relays' and Esplora's rate limits set the ceiling (see Rate limits). |
| `onProgress`    | —            | `(done, total, last?) => void` — fires after every candidate.                            |
| `relays`        | SDK defaults | Override Nostr discovery relays.                                                         |
| `rejectOnError` | `true`       | A candidate still unread after the retries is left off `ok` and listed in `unread`. Set `false` to throw `AirdropUnreadError` (carrying the whole result) instead. |
| `retryUnread`   | `2`          | How many more times to check an unread candidate. A capped or refused address is not asked again. |
| `retryDelayMs`  | `30000`      | Wait before each retry: a rate-limit window.                                             |

**Returns:** `{ ok: string[], rejected: AirdropDecision[], unread: AirdropDecision[], all: AirdropDecision[] }`.

A candidate is **unread** when nothing was concluded about it: no chain API or relay answered (`chain_unread`, `attestation_unread`, `stake_unread`), the lookup threw (`lookup_error`), its address holds more coins than the chain API lists (`utxo_cap_unread`), or the API refused the lookup (`provider_refused_unread`). It is never in `rejected` and never reported as below a threshold: a bulk run trips the explorer's rate limit partway, and dropping everyone checked during it would cut qualifying people out of the allocation.

Any other option throws.

Addresses are deduplicated before checking — duplicates in input waste API calls and never change the outcome.

### `AirdropDecision`

```ts
interface AirdropDecision {
    address: string;
    ok: boolean;
    reasons: string[]; // empty on pass
    unread?: string; // which read did not finish; such a decision is in `unread`
    check?: CheckResult; // present unless the lookup threw
}
```

---

## CLI — `oc-airdrop`

Ships as a binary. Reads addresses on stdin (one per line; blanks and `#` comments ignored), writes the allowlist to stdout, progress and rejections to stderr.

```bash
oc-airdrop filter --min-sats 100000 --min-days 30 \
  < candidates.txt \
  > allowlist.txt \
  2> rejections.log
```

### Flags

| Flag                    | Default | Notes                                                                                  |
| ----------------------- | ------- | -------------------------------------------------------------------------------------- |
| `--min-sats <n>`        | `0`     | Threshold.                                                                             |
| `--min-days <n>`        | `0`     | Threshold.                                                                             |
| `--concurrency <n>`     | `4`     | Parallel lookups.                                                                      |
| `--allow-lookup-errors` | off     | Write no allowlist, and exit 3, when a candidate stays unread.                         |
| `--json`                | off     | Emit full JSON report (allowlist + rejections) to stdout instead of a plain allowlist. |
| `-h`, `--help`          | —       | Show usage.                                                                            |

Exit codes: `0` every candidate was decided, `1` usage or error, `3` some candidates stayed unread after the retries. They are left off the allowlist and listed on stderr.

### JSON report shape

```json
{
  "total": 100,
  "passed": 72,
  "rejected": 27,
  "unread": 1,
  "allowlist": ["bc1q...", "bc1q...", ...],
  "rejections": [
    {
      "address": "bc1q...",
      "ok": false,
      "reasons": ["below_min_sats"],
      "check": { ... }
    },
    ...
  ]
}
```

### Shell one-liners

```bash
# Take 10 000 candidates, emit the filtered allowlist
oc-airdrop filter --min-sats 100000 --min-days 30 < candidates.txt > allowlist.txt

# Generate a full audit trail with reasons
oc-airdrop filter --min-sats 1000000 --json < candidates.txt > report.json

# Count survivors without writing a file
oc-airdrop filter --min-sats 100000 < candidates.txt | wc -l
```

---

## Library example — progress UI

```ts
import { filterAllowlist } from '@orangecheck/airdrop-gate';

const progress = document.getElementById('progress')!;
const { ok, rejected } = await filterAllowlist(addresses, {
    minSats: 100_000,
    minDays: 30,
    concurrency: 8,
    onProgress: (done, total, last) => {
        progress.textContent = `${done}/${total} — ${last?.ok ? 'pass' : 'fail'} ${last?.address.slice(0, 12)}…`;
    },
});
console.log(`${ok.length} qualify; ${rejected.length} rejected`);
```

---

## Threat model

- **What the filter raises the cost of.** Mass sybil attacks. A 10 000-wallet sybil needs 10 000 × `min_sats` of locked Bitcoin to defeat the gate. At meaningful thresholds that's ruinous to fake.
- **What it doesn't solve.** Collusion between real users pooling capital. An attacker with 10 real wallets and a market-clearing price of Bitcoin can still claim 10 drops. This is a _cost raiser_, not an attack-proof identity system.
- **Front-running.** Candidates can lock sats _just_ before the snapshot. Pair with `min_days` requirements and snapshot in the past. Otherwise attackers take the attestation, claim, then move funds on to the next drop.

---

## Rate limits

`filterAllowlist()` calls no OrangeCheck-hosted service. Each candidate is a `check()` run in your process: it reads the Nostr relays (the SDK's defaults, or your own through `relays`) and the SDK's default Esplora API (mempool.space). Their rate limits are the ceiling, so keep `concurrency` modest for a large list, or point `relays` at relays you run.

---

## License

MIT. The OrangeCheck protocol specifications are MIT too.
