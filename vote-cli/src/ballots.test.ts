import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { ballotId, pollId, type Ballot, type Poll } from '@orangecheck/vote-core';
import { describe, expect, it } from 'vitest';

import { ballotCopiesFromEvents, ballotVerdicts } from './ballots.js';
import { bip322Verify } from './bip322.js';
import { computeTally } from './commands/tally.js';
import type { NostrEvent } from './nostr.js';

// Real BIP-322 signatures, checked the way `oc-vote tally` and `oc-vote verify` check them.
const kC = '11'.repeat(32);
const k1 = '22'.repeat(32);
const k2 = '33'.repeat(32);
const CREATOR = addressFromPrivateKey(kC, 'p2wpkh');
const V1 = addressFromPrivateKey(k1, 'p2wpkh');
const V2 = addressFromPrivateKey(k2, 'p2wpkh');

const poll: Poll = {
    v: 0,
    kind: 'oc-vote/poll',
    creator: CREATOR,
    question: 'Ship it?',
    options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
    ],
    deadline: '2026-10-21T00:00:00Z',
    snapshot_block: 900000,
    weight_mode: 'sats',
    weight_params: null,
    min_sats: 0,
    min_days: 0,
    mode: 'public',
    reveal_pk: null,
    tiebreak: 'latest',
    notes: null,
    created_at: '2026-10-01T00:00:00Z',
    sig: { alg: 'bip322', pubkey: CREATOR, value: '' },
};
poll.sig.value = signMessage(CREATOR, pollId(poll), kC);
const pid = pollId(poll);

function signed(voter: string, key: string, option: string): Ballot {
    const b: Ballot = {
        v: 0,
        kind: 'oc-vote/ballot',
        poll_id: pid,
        voter,
        option,
        attestation_id: null,
        secret: null,
        created_at: '2026-10-10T00:00:00Z',
        sig: { alg: 'bip322', pubkey: voter, value: '' },
    };
    b.sig.value = signMessage(voter, ballotId(b), key);
    return b;
}
const yes = signed(V1, k1, 'yes');
const no = signed(V2, k2, 'no');
// Every signed field of V2's ballot, so the same ballot_id, with a signature that fails.
const badCopy: Ballot = { ...no, sig: { ...no.sig, value: 'AAAA' } };
const ev = (b: Ballot, created_at: number): NostrEvent => ({
    id: `${ballotId(b).slice(0, 8)}-${created_at}`,
    kind: 30081,
    pubkey: '',
    created_at,
    content: JSON.stringify(b),
    tags: [['t', pid]],
    sig: '',
});
const utxosAt = async (addr: string) =>
    addr === V1
        ? [{ value: 100_000, confirmed_height: 800_000 }]
        : addr === V2
          ? [{ value: 300_000, confirmed_height: 800_000 }]
          : [];
const orders = [
    [ev(yes, 10), ev(badCopy, 11), ev(no, 10)],
    [ev(yes, 10), ev(no, 10), ev(badCopy, 9)],
];

describe('ballot copies (ballot_id leaves out sig.value)', () => {
    it('tally counts a ballot whatever other copies of it the relays return, in either order', async () => {
        for (const events of orders) {
            const r = await computeTally({
                poll,
                ballots: ballotCopiesFromEvents(events, pid),
                reveal: null,
                utxosAt,
                snapshotBlock: 900000,
                verify: bip322Verify,
            });
            expect(r).toMatchObject({ state: 'tallied', tallies: { yes: 100_000, no: 300_000 } });
        }
    });

    it('verify reports a ballot valid when any copy of it verifies', () => {
        for (const events of orders) {
            const verdicts = ballotVerdicts(ballotCopiesFromEvents(events, pid));
            expect(verdicts).toHaveLength(2);
            expect(verdicts.every((v) => v.ok)).toBe(true);
        }
    });
});
