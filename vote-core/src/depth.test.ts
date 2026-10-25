// SPEC §7: a poll, ballot or reveal nests at most 32 levels; one deeper is
// malformed. Talliers that apply the same limit count the same ballot for
// each voter.

import { x25519 } from '@noble/curves/ed25519';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';

import { MAX_NESTING_DEPTH, nestedTooDeep } from './depth.js';
import { pollId } from './ids.js';
import { tally } from './tally.js';
import type { Ballot, Poll, Reveal } from './types.js';
import { verifyBallot, verifyPoll, verifyReveal, VoteError } from './verify.js';

const CREATOR = 'bc1qcreator0000000000000000000000000000000';
const ALICE = 'bc1qalice00000000000000000000000000000000';
const REVEAL_SK = 'cd'.repeat(32);
const verify = ({ signature }: { signature: string }) => signature === 'good';
const oneUtxo = async () => [{ value: 100_000, confirmed_height: 800_000 }];

/** `levels` nested objects: {a:{a:…'x'…}}. */
const nest = (levels: number): unknown => (levels === 0 ? 'x' : { a: nest(levels - 1) });

function mkPoll(over: Partial<Poll> = {}): Poll {
    return {
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
        ...over,
    };
}

function mkBallot(poll: Poll, over: Partial<Ballot> = {}): Ballot {
    return {
        v: 0,
        kind: 'oc-vote/ballot',
        poll_id: pollId(poll),
        voter: ALICE,
        option: 'yes',
        attestation_id: null,
        secret: null,
        created_at: '2026-06-02T00:00:00Z',
        sig: { alg: 'bip322', pubkey: ALICE, value: 'good' },
        ...over,
    };
}

/** A ballot whose deepest field is `depth` levels down, counting the ballot as level 1. */
const ballotAtDepth = (poll: Poll, depth: number, over: Partial<Ballot> = {}) =>
    mkBallot(poll, { attestation_id: nest(depth - 1) as string, ...over });

describe('nestedTooDeep', () => {
    it('counts the value itself as level 1, arrays like objects, and scalars as none', () => {
        expect(MAX_NESTING_DEPTH).toBe(32);
        expect(nestedTooDeep('x')).toBe(false);
        expect(nestedTooDeep(nest(32))).toBe(false);
        expect(nestedTooDeep(nest(33))).toBe(true);
        expect(nestedTooDeep([[[1]]], 3)).toBe(false);
        expect(nestedTooDeep([[[[1]]]], 3)).toBe(true);
    });

    it('walks a value far too deep for recursion without throwing', () => {
        expect(nestedTooDeep(JSON.parse('['.repeat(100_000) + ']'.repeat(100_000)))).toBe(true);
    });
});

describe('a poll, ballot or reveal nested deeper than 32 levels is malformed', () => {
    const poll = mkPoll();

    it('a ballot at 32 levels verifies; at 33 it does not', async () => {
        expect(await verifyBallot(ballotAtDepth(poll, 32), verify)).toEqual({ ok: true });
        expect(await verifyBallot(ballotAtDepth(poll, 33), verify)).toMatchObject({ ok: false, code: 'E_WRONG_POLL' });
    });

    it('a poll at 33 levels does not verify, and is not tallied', async () => {
        expect(await verifyPoll(mkPoll({ weight_params: nest(31) as Record<string, unknown> }), verify)).toEqual({ ok: true });
        const deep = mkPoll({ weight_params: nest(32) as Record<string, unknown> });
        expect(await verifyPoll(deep, verify)).toMatchObject({ ok: false, code: 'E_WRONG_POLL' });
        await expect(tally({ poll: deep, ballots: [], utxosAt: oneUtxo, verify })).rejects.toBeInstanceOf(VoteError);
    });

    it('a reveal at 33 levels does not verify', async () => {
        const secret = mkPoll({ mode: 'secret', reveal_pk: bytesToHex(x25519.getPublicKey(hexToBytes(REVEAL_SK))) });
        const reveal = (extra: unknown): Reveal =>
            ({
                v: 0,
                kind: 'oc-vote/reveal',
                poll_id: pollId(secret),
                reveal_sk: REVEAL_SK,
                revealed_at: '2026-11-02T00:00:00Z',
                sig: { alg: 'bip322', pubkey: CREATOR, value: 'good' },
                extra,
            }) as Reveal;
        const after = Date.parse('2026-11-01T00:00:00Z');
        expect(await verifyReveal(reveal(nest(31)), secret, verify, after)).toEqual({ ok: true });
        expect(await verifyReveal(reveal(nest(32)), secret, verify, after)).toMatchObject({ ok: false, code: 'E_NO_REVEAL' });
    });

    it("a voter's later ballot counts at 32 levels; at 33 it is dropped and the earlier one stands", async () => {
        const earlier = mkBallot(poll, { option: 'yes' });
        const later = (depth: number) => ballotAtDepth(poll, depth, { option: 'no', created_at: '2026-06-03T00:00:00Z' });
        const counted = (depth: number) =>
            tally({ poll, ballots: [earlier, later(depth)], utxosAt: oneUtxo, verify, snapshotBlock: 900000 });
        expect(await counted(32)).toMatchObject({ state: 'tallied', tallies: { yes: 0, no: 1 } });
        expect(await counted(33)).toMatchObject({ state: 'tallied', tallies: { yes: 1, no: 0 } });
    });
});
