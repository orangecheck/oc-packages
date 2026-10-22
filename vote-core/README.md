# @orangecheck/vote-core

> **Full reference:** [ochk.io/docs/sdk/vote-core](https://ochk.io/docs/sdk/vote-core) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


Reference implementation of [oc-vote-protocol v0](https://github.com/orangecheck/oc-vote-protocol) — stake-weighted, sybil-resistant, offline-tallyable polls on Bitcoin.

```bash
npm i @orangecheck/vote-core @orangecheck/bip322
```

## What it gives you

- `canonicalize(obj) / canonicalBytes(obj)` — RFC 8785 canonicalization with the spec's `options[]` preservation rule.
- `pollId(poll) / ballotId(ballot) / revealId(reveal)` — content-addressed ids via SHA-256 of canonical bytes with `sig.value` emptied.
- `commit(pollId, voter, option)` — secret-mode commitment per SPEC §4.4.
- `voterWeight({ utxos, snapshot, minSats, minDays, mode, params })` — three canonical weight modes: `one_per_address`, `sats`, `sats_days`.
- `tally({ poll, ballots, utxosAt, verify, unseal?, snapshotBlock?, tipHeight?, closeHeight?, anchorHeight? })` — deterministic pure tally function. Verifies the poll's creator signature and every ballot's; in secret mode `unseal(ballot)` is called only on each voter's verified, tiebroken ballot. Every result carries `basis`; a tally lists the ballots it counted in `counted`. An anchored poll (deadline on or after 2026-11-15T00:00:00Z, SPEC §4.6) needs `tipHeight`, `closeHeight` (`H_close`, or null while unknown) and `anchorHeight`, and is `provisional`, with an `unanchored` count, until the tip reaches `H_close + G + 6`. A snapshot block that is unknown or has fewer than 6 confirmations gives `{ state: 'deferred', code: 'E_REORG' }`.
- `distinctBallotCopies(ballots)` — what to pass `tally` as `ballots`: every copy read from relays, byte-identical copies collapsed. Never keep one copy per `ballot_id` first; `ballot_id` leaves out `sig.value`, and `tally` verifies each copy.
- `verifyPoll(poll, verify)` / `verifyBallot(ballot, verify)` / `verifyReveal(reveal, poll, verify, now?, chain?)` — SPEC §3.3 / §4.3 structure plus the creator's or voter's BIP-322 signature (§10.1, §6.4, §10.3). `verifyReveal` also requires the reveal key to be the poll's `reveal_pk`, and accepts a reveal only once the poll has closed: for an anchored poll, once `chain.tipHeight` reaches `H_close + G + 6`; otherwise once `now` (default: the current time) has reached the deadline.
- `anchorHeightFromStamps(ballotId, stamps, verifyAnchor)` — a ballot's anchor height (SPEC §4.6) from every OC Stamp copy read from every relay: the lowest height `verifyAnchor` confirms among stamps whose `content.hash` names the ballot. `ballotStampContent(ballot)` gives the `content` a stamp over the ballot carries. `isAnchoredPoll`, `ANCHOR_GRACE_BLOCKS` (`G` = 36) and `anchoredTallyIsFinal` state the rest of §4.6.
- `parseUtc(value)` — milliseconds for an `iso8601_utc` time (SPEC §0), or null. Deadlines and ballot times are read only this way.
- `isMainnetAddress(addr)` — network check by address prefix (§3.3, §4.3).
- `resolveCloseBlock(deadline, source)` — `H_close`, the greatest block height whose `median_time_past` ≤ deadline, with the tip it was read against; `height` is null until a block's `median_time_past` passes the deadline.
- `resolvePollSnapshot(poll, source)` / `resolveDeadlineSnapshot(deadline, source)` — the §3.3 snapshot block (`H_close` once it has ≥ 6 confirmations); `mempoolBlockTimeSource()` supplies chain data from mempool.space or your own instance.
- Full TypeScript types for `Poll`, `Ballot`, `Reveal`, `TallyResult`.

## Conformance

The package ships vitest suite that loads the canonical fixtures from [`oc-vote-protocol/test-vectors/`](https://github.com/orangecheck/oc-vote-protocol/tree/main/test-vectors) and asserts byte-identical canonical bytes, ids, commits, and tally output for every vector there (sixteen as of oc-vote-protocol's anchored-ballots release: v01–v07 clock-dated, v08–v15 anchored polls, an open anchored poll and a deferred tally, v16 the order of `counted`).

## Usage

### Tally an open poll from any transport

```ts
import { verifySignature } from '@orangecheck/bip322';
import { mempoolBlockTimeSource, resolvePollSnapshot, tally } from '@orangecheck/vote-core';

// A "deadline" poll needs its snapshot height resolved first.
const snap = await resolvePollSnapshot(poll, mempoolBlockTimeSource());
if (!snap.ok) throw new Error(`${snap.code}: ${snap.reason}`);

const result = await tally({
  poll,
  ballots,
  snapshotBlock: snap.height,
  utxosAt: (addr, snapshotBlock) => fetchUtxos(addr, snapshotBlock),
  tipHeight, // defers a snapshot with < 6 confirmations (E_REORG); required for an anchored poll
  verify: ({ address, message, signature }) => verifySignature(address, message, signature),
  // secret mode only, once the creator's reveal is verified:
  // unseal: (ballot) => openEnvelope(ballot.secret.envelope, reveal.reveal_sk),
});

// { state: 'tallied', basis: 'voter_clocks', snapshot_block: 900000, turnout: {...}, tallies: {...}, counted: [...] }
```

### Tally an anchored poll

```ts
import { anchorHeightFromStamps, isAnchoredPoll, mempoolBlockTimeSource, resolveCloseBlock, tally } from '@orangecheck/vote-core';

if (isAnchoredPoll(poll)) {
  const close = await resolveCloseBlock(poll.deadline, mempoolBlockTimeSource());
  if (!close.ok) throw new Error(`${close.code}: ${close.reason}`);
  const result = await tally({
    poll,
    ballots,
    utxosAt,
    verify,
    tipHeight: close.tip,
    closeHeight: close.height, // null while the poll is open
    // Every stamp copy from every relay (REQ kinds 30083, #t sha256:<ballot_id>).
    // verifyAnchor rebuilds the stamp id and walks its OTS proof to a header you checked.
    anchorHeight: (id) => anchorHeightFromStamps(id, stampsByBallot.get(id) ?? [], verifyAnchor),
  });
  // { state: 'provisional', basis: 'anchored', close_height: null, ..., counted: [...], unanchored: 2 }
}
```

### Build a ballot ready to sign

```ts
import { ballotId } from '@orangecheck/vote-core';

const draft = {
  v: 0, kind: 'oc-vote/ballot',
  poll_id, voter, option: 'yes',
  attestation_id: null, secret: null,
  created_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  sig: { alg: 'bip322', pubkey: voter, value: '' },
} as const;

const id = ballotId(draft);
// ask your wallet to BIP-322 sign `id`, then set sig.value
```

### Secret-mode commit

```ts
import { commit } from '@orangecheck/vote-core';

const c = commit(pollId, voterAddr, 'yes');
// embed `c` in ballot.secret.commit; encrypt the option id to poll.reveal_pk
// via an oc-lock envelope in ballot.secret.envelope.
```

## Design rules this respects

- **Bitcoin is load-bearing**: weight is a function of sats × days of UTXO age.
- **No custody**: library never touches a private key, never signs transactions.
- **Offline-verifiable**: the tally is pure; two callers with the same inputs get byte-identical output.
- **Content-addressed**: every object's id is SHA-256 of its canonical bytes, committed to by BIP-322.
- **Small canonical surface**: three weight modes, two tiebreaks, two poll modes.

See [oc-vote-protocol/WHY.md](https://github.com/orangecheck/oc-vote-protocol/blob/main/WHY.md) for the design rationale.

## Related

- **Protocol spec**: [`orangecheck/oc-vote-protocol`](https://github.com/orangecheck/oc-vote-protocol)
- **Reference web client**: [vote.ochk.io](https://vote.ochk.io) (closed-source; consumes this package from npm)
- **Family**: [`@orangecheck/lock-core`](https://npmjs.com/package/@orangecheck/lock-core) (encryption primitive; composed here for secret-ballot envelopes)

## License

MIT.
