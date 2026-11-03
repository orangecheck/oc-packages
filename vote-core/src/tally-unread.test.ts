// chain-read-failures VO2: a voter whose coins the chain did not give is unread,
// never weighed 0, and one unread voter turns the tally into a report of who could
// not be read, with no count (SPEC §8, as for a ballot read that fell short).

import { describe, expect, it } from 'vitest';

import { pollId } from './ids.js';
import { tally } from './tally.js';
import type { Ballot, Poll, Utxo, UtxoLookup } from './types.js';
import { UtxoUnreadError } from './verify.js';

const CREATOR = 'bc1qcreator0000000000000000000000000000000';
const ALICE = 'bc1qalice00000000000000000000000000000000';
const BOB = 'bc1qbob0000000000000000000000000000000000';

const poll: Poll = {
    v: 0,
    kind: 'oc-vote/poll',
    creator: CREATOR,
    question: 'ship?',
    options: [
        { id: 'yes', label: 'yes' },
        { id: 'no', label: 'no' },
    ],
    deadline: '2026-11-01T00:00:00Z',
    snapshot_block: 900000,
    weight_mode: 'one_per_address',
    weight_params: null,
    min_sats: 0,
    min_days: 0,
    mode: 'public',
    reveal_pk: null,
    tiebreak: 'latest',
    notes: null,
    created_at: '2026-06-01T00:00:00Z',
    sig: { alg: 'bip322', pubkey: CREATOR, value: 'good' },
};

const ballot = (voter: string, option: string): Ballot => ({
    v: 0,
    kind: 'oc-vote/ballot',
    poll_id: pollId(poll),
    voter,
    option,
    attestation_id: null,
    secret: null,
    created_at: '2026-06-02T00:00:00Z',
    sig: { alg: 'bip322', pubkey: voter, value: 'good' },
});

const verify = ({ signature }: { signature: string }) => signature === 'good';
const coins: Utxo[] = [{ value: 100_000, confirmed_height: 800_000 }];
const ballots = [ballot(ALICE, 'yes'), ballot(BOB, 'no')];
const run = (utxosAt: UtxoLookup) => tally({ poll, ballots, utxosAt, verify });

describe('tally: three outcomes for a voter, and no count while one is unread', () => {
    it('counts every voter whose coins were read', async () => {
        await expect(run(async () => coins)).resolves.toMatchObject({ state: 'tallied', tallies: { yes: 1, no: 1 } });
    });

    it('a voter whose coins were not read makes the tally unread, naming them and why, with no count', async () => {
        const r = await run(async (addr) => {
            if (addr === BOB) throw new UtxoUnreadError('utxo_cap_unread');
            return coins;
        });
        expect(r).toEqual({ state: 'unread', basis: 'voter_clocks', snapshot_block: 900000, unread: [{ voter: BOB, reason: 'utxo_cap_unread' }] });
        expect(r).not.toHaveProperty('tallies');
        expect(r).not.toHaveProperty('turnout');
    });

    it('lists every unread voter, ascending, each with its reason', async () => {
        const r = await run(async (addr) => {
            throw new UtxoUnreadError(addr === ALICE ? 'chain_unread' : 'provider_refused_unread');
        });
        expect(r).toMatchObject({
            state: 'unread',
            unread: [
                { voter: ALICE, reason: 'chain_unread' },
                { voter: BOB, reason: 'provider_refused_unread' },
            ],
        });
    });

    it('a voter whose coins were read and fall short weighs 0, which is not unread', async () => {
        const floor: Poll = { ...poll, min_sats: 50_000 };
        const at = (voter: string, option: string) => ({ ...ballot(voter, option), poll_id: pollId(floor) });
        const r = await tally({
            poll: floor,
            ballots: [at(ALICE, 'yes'), at(BOB, 'no')],
            utxosAt: async (addr) => (addr === BOB ? [] : coins),
            verify,
        });
        expect(r).toMatchObject({ state: 'tallied', tallies: { yes: 1, no: 0 } });
    });

    it('any other throw from the lookup still aborts the tally', async () => {
        await expect(
            run(async () => {
                throw new Error('mempool.space utxo fetch 500');
            })
        ).rejects.toThrow('mempool.space utxo fetch 500');
    });

    it('keeps nothing: the next tally reads the chain again', async () => {
        let answered = false;
        const utxosAt: UtxoLookup = async () => {
            if (!answered) throw new UtxoUnreadError('chain_unread');
            return coins;
        };
        await expect(run(utxosAt)).resolves.toMatchObject({ state: 'unread' });
        answered = true;
        await expect(run(utxosAt)).resolves.toMatchObject({ state: 'tallied', tallies: { yes: 1, no: 1 } });
    });
});
