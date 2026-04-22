# `@orangecheck/airdrop-gate`

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

const { ok, rejected } = await filterAllowlist(candidates, {
    minSats: 100_000,
    minDays: 30,
    concurrency: 8,
    onProgress: (done, total) => console.log(`${done}/${total}`),
});

// `ok` is your final allowlist (addresses, in input order).
// `rejected` explains why each excluded address was dropped.
```

### `filterAllowlist(addresses, options?)`

| Option          | Default      | Notes                                                                                    |
| --------------- | ------------ | ---------------------------------------------------------------------------------------- |
| `minSats`       | `0`          | Minimum sats bonded.                                                                     |
| `minDays`       | `0`          | Minimum days unspent.                                                                    |
| `concurrency`   | `4`          | Parallel `check()` calls. Tune up to your hosted-API rate budget (60/min/IP on ochk.io — self-host for higher). |
| `onProgress`    | —            | `(done, total, last?) => void` — fires after every candidate.                            |
| `relays`        | SDK defaults | Override Nostr discovery relays.                                                         |
| `rejectOnError` | `true`       | Treat SDK failures as rejection. Set `false` to surface errors to the caller.            |

**Returns:** `{ ok: string[], rejected: AirdropDecision[], all: AirdropDecision[] }`.

Addresses are deduplicated before checking — duplicates in input waste API calls and never change the outcome.

### `AirdropDecision`

```ts
interface AirdropDecision {
    address: string;
    ok: boolean;
    reasons: string[]; // empty on pass
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
| `--allow-lookup-errors` | off     | Surface SDK errors instead of rejecting.                                               |
| `--json`                | off     | Emit full JSON report (allowlist + rejections) to stdout instead of a plain allowlist. |
| `-h`, `--help`          | —       | Show usage.                                                                            |

### JSON report shape

```json
{
  "total": 100,
  "passed": 72,
  "rejected": 28,
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

The free hosted `/api/check` tier allows 60 requests per minute per IP. That's 3 600 candidates/hour. For larger drops, deploy your own verifier (the whole SDK is open source — point `filterAllowlist()`'s `relays` at your own Nostr + the SDK at your own Esplora) or contact us for a higher-tier hosted key.

---

## License

MIT. The OrangeCheck protocol is CC-BY-4.0.
