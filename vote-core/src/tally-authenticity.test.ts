// Authenticity and input-domain rules from SPEC §3.3, §4.3, §6.4, §8 and §10.

import { describe, expect, it } from 'vitest';

import { commit } from './commit.js';
import { ballotId, pollId, revealId } from './ids.js';
import { tally } from './tally.js';
import type { Ballot, Poll, Reveal } from './types.js';
import { isMainnetAddress, verifyBallot, verifyPoll, verifyReveal, VoteError } from './verify.js';

const CREATOR = 'bc1qcreator0000000000000000000000000000000';
const ALICE = 'bc1qalice00000000000000000000000000000000';
const BOB = 'bc1qbob0000000000000000000000000000000000';

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
        deadline: '2026-12-01T00:00:00Z',
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

function mkBallot(poll: Poll, voter: string, over: Partial<Ballot> = {}): Ballot {
    return {
        v: 0,
        kind: 'oc-vote/ballot',
        poll_id: pollId(poll),
        voter,
        option: 'yes',
        attestation_id: null,
        secret: null,
        created_at: '2026-06-02T00:00:00Z',
        sig: { alg: 'bip322', pubkey: voter, value: 'good' },
        ...over,
    };
}

// Test verifier: a signature is valid iff its value is "good".
const verify = ({ signature }: { signature: string }) => signature === 'good';
const oneUtxo = async () => [{ value: 100_000, confirmed_height: 800_000 }];

function secretBallot(poll: Poll, voter: string, option: string, created_at: string, sig: string): Ballot {
    return mkBallot(poll, voter, {
        option: null,
        created_at,
        // The envelope stands in for an OC Lock envelope; the test unsealer reads `plain`.
        secret: { envelope: { plain: option }, commit: commit(pollId(poll), voter, option) },
        sig: { alg: 'bip322', pubkey: voter, value: sig },
    });
}
const readPlain = (b: Ballot) => String((b.secret?.envelope as { plain: string }).plain);

describe('secret mode: unseal runs on the verified per-voter ballot only (SPEC §8 steps 1-3)', () => {
    const poll = mkPoll({ mode: 'secret', reveal_pk: 'ab'.repeat(32) });

    it('an unsigned later ballot does not replace or remove the voter’s signed ballot', async () => {
        const signed = secretBallot(poll, ALICE, 'yes', '2026-06-02T00:00:00Z', 'good');
        const unsigned = secretBallot(poll, ALICE, 'no', '2026-06-03T00:00:00Z', 'bad');
        const seen: string[] = [];
        const r = await tally({
            poll,
            ballots: [signed, unsigned],
            utxosAt: oneUtxo,
            verify,
            unseal: (b) => {
                seen.push(ballotId(b));
                return readPlain(b);
            },
        });
        expect(r).toMatchObject({ state: 'tallied', tallies: { yes: 1, no: 0 } });
        expect(seen).toEqual([ballotId(signed)]);
    });

    it('a revealed option outside poll.options is dropped (E_UNKNOWN_OPTION)', async () => {
        const r = await tally({
            poll,
            ballots: [
                secretBallot(poll, ALICE, 'constructor', '2026-06-02T00:00:00Z', 'good'),
                secretBallot(poll, BOB, 'yes', '2026-06-02T00:00:00Z', 'good'),
            ],
            utxosAt: oneUtxo,
            verify,
            unseal: readPlain,
        });
        expect(r).toEqual({
            state: 'tallied',
            snapshot_block: 900000,
            turnout: { voters: 1, weight: 1 },
            tallies: { yes: 1, no: 0 },
        });
    });

    it('a voter whose envelope does not open is dropped, others still count', async () => {
        const r = await tally({
            poll,
            ballots: [
                secretBallot(poll, ALICE, 'yes', '2026-06-02T00:00:00Z', 'good'),
                secretBallot(poll, BOB, 'no', '2026-06-02T00:00:00Z', 'good'),
            ],
            utxosAt: oneUtxo,
            verify,
            unseal: (b) => {
                if (b.voter === BOB) throw new Error('cannot open');
                return readPlain(b);
            },
        });
        expect(r).toMatchObject({ turnout: { voters: 1 }, tallies: { yes: 1, no: 0 } });
    });
});

describe('option ids are plain keys', () => {
    it('counts an option whose id is "__proto__"', async () => {
        const poll = mkPoll({
            options: [
                { id: '__proto__', label: 'a' },
                { id: 'no', label: 'b' },
            ],
        });
        const r = await tally({
            poll,
            ballots: [mkBallot(poll, ALICE, { option: '__proto__' })],
            utxosAt: oneUtxo,
            verify,
        });
        expect(r.state === 'tallied' && Object.entries(r.tallies)).toEqual([
            ['__proto__', 1],
            ['no', 0],
        ]);
    });
});

describe('voters must be on Bitcoin mainnet (SPEC §4.3)', () => {
    it('drops a testnet voter without querying its UTXOs', async () => {
        const poll = mkPoll();
        const utxosAt = async (addr: string) => {
            if (!isMainnetAddress(addr)) throw new Error(`lookup failed for ${addr}`);
            return [{ value: 1, confirmed_height: 1 }];
        };
        const r = await tally({
            poll,
            ballots: [
                mkBallot(poll, ALICE),
                mkBallot(poll, 'tb1qtestnet000000000000000000000000000000', { option: 'no' }),
            ],
            utxosAt,
            verify,
        });
        expect(r).toMatchObject({ turnout: { voters: 1 }, tallies: { yes: 1, no: 0 } });
    });

    it('classifies addresses by network prefix', () => {
        expect(isMainnetAddress('bc1qxyz')).toBe(true);
        expect(isMainnetAddress('BC1QXYZ')).toBe(true);
        expect(isMainnetAddress('1BoatSLRHtKNngkdXEeobR76b53LETtpyT')).toBe(true);
        expect(isMainnetAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
        expect(isMainnetAddress('tb1qxyz')).toBe(false);
        expect(isMainnetAddress('bcrt1qxyz')).toBe(false);
        expect(isMainnetAddress('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn')).toBe(false);
        expect(isMainnetAddress('2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc')).toBe(false);
        expect(isMainnetAddress(undefined)).toBe(false);
    });
});

describe('poll signature (SPEC §10.1)', () => {
    it('tally throws E_BAD_SIG on a poll whose signature does not verify', async () => {
        const poll = mkPoll({ sig: { alg: 'bip322', pubkey: CREATOR, value: 'bad' } });
        const err = await tally({ poll, ballots: [], utxosAt: oneUtxo, verify }).catch((e) => e);
        expect(err).toBeInstanceOf(VoteError);
        expect((err as VoteError).code).toBe('E_BAD_SIG');
    });

    it('tally verifies the creator over poll_id', async () => {
        const poll = mkPoll();
        const calls: Array<{ address: string; message: string }> = [];
        await tally({
            poll,
            ballots: [],
            utxosAt: oneUtxo,
            verify: ({ address, message, signature }) => {
                calls.push({ address, message });
                return signature === 'good';
            },
        });
        expect(calls[0]).toEqual({ address: CREATOR, message: pollId(poll) });
    });

    it('verifyPoll accepts a well-formed signed poll', async () => {
        expect(await verifyPoll(mkPoll(), verify)).toEqual({ ok: true });
    });

    it.each([
        ['bad signature', { sig: { alg: 'bip322' as const, pubkey: CREATOR, value: 'bad' } }, 'E_BAD_SIG'],
        ['testnet creator', { creator: 'tb1qcreator' }, 'E_WRONG_POLL'],
        ['one option', { options: [{ id: 'yes', label: 'y' }] }, 'E_WRONG_POLL'],
        [
            'duplicate option ids',
            { options: [{ id: 'a', label: 'a' }, { id: 'a', label: 'b' }] },
            'E_WRONG_POLL',
        ],
        ['secret without reveal_pk', { mode: 'secret' as const }, 'E_WRONG_POLL'],
        ['fractional snapshot', { snapshot_block: 1.5 }, 'E_WRONG_POLL'],
    ])('verifyPoll rejects: %s', async (_name, over, code) => {
        const r = await verifyPoll(mkPoll(over as Partial<Poll>), verify);
        expect(r).toMatchObject({ ok: false, code });
    });
});

describe('snapshot confirmations (SPEC §10.5)', () => {
    const poll = mkPoll();
    const run = (tipHeight: number) =>
        tally({ poll, ballots: [mkBallot(poll, ALICE)], utxosAt: oneUtxo, verify, tipHeight });

    it('throws E_REORG for a snapshot above the tip', async () => {
        await expect(run(899_000)).rejects.toMatchObject({ code: 'E_REORG' });
    });

    it('throws E_REORG with fewer than 6 confirmations', async () => {
        await expect(run(900_004)).rejects.toMatchObject({ code: 'E_REORG' });
    });

    it('tallies at exactly 6 confirmations', async () => {
        await expect(run(900_005)).resolves.toMatchObject({ state: 'tallied' });
    });
});

describe('verifyReveal (SPEC §6.4, §10.3)', () => {
    const poll = mkPoll({ mode: 'secret', reveal_pk: 'ab'.repeat(32) });
    const mkReveal = (over: Partial<Reveal> = {}): Reveal => ({
        v: 0,
        kind: 'oc-vote/reveal',
        poll_id: pollId(poll),
        reveal_sk: 'cd'.repeat(32),
        revealed_at: '2026-12-02T00:00:00Z',
        sig: { alg: 'bip322', pubkey: CREATOR, value: 'good' },
        ...over,
    });

    it('accepts a creator-signed reveal after the deadline, signed over reveal_id', async () => {
        const r = mkReveal();
        const calls: string[] = [];
        const res = await verifyReveal(r, poll, (a) => {
            calls.push(`${a.address}:${a.message}`);
            return verify(a);
        });
        expect(res).toEqual({ ok: true });
        expect(calls).toEqual([`${CREATOR}:${revealId(r)}`]);
    });

    it.each([
        ['premature', { revealed_at: '2026-11-30T00:00:00Z' }],
        ['other poll', { poll_id: '00'.repeat(32) }],
        ['bad signature', { sig: { alg: 'bip322' as const, pubkey: CREATOR, value: 'bad' } }],
        ['malformed reveal_sk', { reveal_sk: 'zz' }],
    ])('rejects: %s', async (_name, over) => {
        expect((await verifyReveal(mkReveal(over as Partial<Reveal>), poll, verify)).ok).toBe(false);
    });
});

describe('verifyBallot (SPEC §4.3, §10.1)', () => {
    const poll = mkPoll();

    it('accepts a voter-signed ballot, signed over ballot_id', async () => {
        const b = mkBallot(poll, ALICE);
        const calls: string[] = [];
        const res = await verifyBallot(b, (a) => {
            calls.push(`${a.address}:${a.message}`);
            return verify(a);
        });
        expect(res).toEqual({ ok: true });
        expect(calls).toEqual([`${ALICE}:${ballotId(b)}`]);
    });

    it('accepts a secret ballot carrying a commit and no option', async () => {
        const b = mkBallot(poll, ALICE, { option: null, secret: { envelope: {}, commit: 'ab'.repeat(32) } });
        expect(await verifyBallot(b, verify)).toEqual({ ok: true });
    });

    it.each([
        ['bad signature', { sig: { alg: 'bip322' as const, pubkey: ALICE, value: 'bad' } }, 'E_BAD_SIG'],
        ['empty signature', { sig: { alg: 'bip322' as const, pubkey: ALICE, value: '' } }, 'E_BAD_SIG'],
        ['testnet voter', { voter: 'tb1qalice' }, 'E_WRONG_POLL'],
        ['other version', { v: 1 as unknown as 0 }, 'E_WRONG_POLL'],
        ['malformed poll_id', { poll_id: 'nope' }, 'E_WRONG_POLL'],
        ['neither option nor secret', { option: null }, 'E_UNKNOWN_OPTION'],
        [
            'both option and secret',
            { secret: { envelope: {}, commit: 'ab'.repeat(32) } },
            'E_UNKNOWN_OPTION',
        ],
    ])('rejects: %s', async (_name, over, code) => {
        const r = await verifyBallot(mkBallot(poll, ALICE, over as Partial<Ballot>), verify);
        expect(r).toMatchObject({ ok: false, code });
    });

    it('rejects a ballot whose signed voter is not the address the signature is checked against', async () => {
        // The signature is checked against `voter`, so a ballot re-labelled
        // with another voter no longer verifies.
        const signedByAlice = mkBallot(poll, ALICE);
        const relabelled = { ...signedByAlice, voter: BOB };
        const res = await verifyBallot(relabelled, ({ address, signature }) => address === ALICE && signature === 'good');
        expect(res).toMatchObject({ ok: false, code: 'E_BAD_SIG' });
    });
});
