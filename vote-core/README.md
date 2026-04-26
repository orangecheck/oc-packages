# @orangecheck/vote-core

Reference implementation of [oc-vote-protocol v0](https://github.com/orangecheck/oc-vote-protocol) — stake-weighted, sybil-resistant, offline-tallyable polls on Bitcoin.

```bash
npm i @orangecheck/vote-core
```

## What it gives you

- `canonicalize(obj) / canonicalBytes(obj)` — RFC 8785 canonicalization with the spec's `options[]` preservation rule.
- `pollId(poll) / ballotId(ballot) / revealId(reveal)` — content-addressed ids via SHA-256 of canonical bytes with `sig.value` emptied.
- `commit(pollId, voter, option)` — secret-mode commitment per SPEC §4.4.
- `voterWeight({ utxos, snapshot, minSats, minDays, mode, params })` — three canonical weight modes: `one_per_address`, `sats`, `sats_days`.
- `tally({ poll, ballots, utxosAt, revealedOptions?, verifyBip322?, skipSignatures? })` — deterministic pure tally function.
- Full TypeScript types for `Poll`, `Ballot`, `Reveal`, `TallyResult`.

## Conformance

The package ships vitest suite that loads the canonical fixtures from [`oc-vote-protocol/test-vectors/`](https://github.com/orangecheck/oc-vote-protocol/tree/main/test-vectors) and asserts byte-identical canonical bytes, ids, commits, and tally output for all five vectors (v01 minimal public, v02 sats-weighted, v03 sats_days with cap, v04 vote-change, v05 secret-ballot).

## Usage

### Tally an open poll from any transport

```ts
import { tally, pollId } from '@orangecheck/vote-core';

const result = await tally({
  poll,
  ballots,
  utxosAt: (addr, snapshotBlock) => fetchUtxos(addr, snapshotBlock),
  skipSignatures: false,
  verifyBip322: async (address, message, sig) => {
    const { Verifier } = await import('bip322-js');
    return Verifier.verifySignature(address, message, sig);
  },
});

// { state: 'tallied', snapshot_block: 900000, turnout: {...}, tallies: {...} }
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
