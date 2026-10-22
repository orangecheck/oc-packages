// Authenticity and input-domain rules from SPEC §3.3, §4.3, §6.4, §8 and §10.

import { x25519 } from '@noble/curves/ed25519';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';

import { commit } from './commit.js';
import { ballotId, pollId, revealId } from './ids.js';
import { distinctBallotCopies, tally } from './tally.js';
import type { Ballot, Poll, Reveal } from './types.js';
import { isMainnetAddress, parseUtc, verifyBallot, verifyPoll, verifyReveal, VoteError } from './verify.js';

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

describe('copies of one ballot (ballot_id leaves out sig.value)', () => {
    const poll = mkPoll();
    const yes = mkBallot(poll, ALICE, { option: 'yes' });
    const no = mkBallot(poll, BOB, { option: 'no' });
    const badCopy = { ...no, sig: { ...no.sig, value: 'bad' } };

    it('a copy whose signature fails does not take the ballot\'s place, in either order', async () => {
        for (const ballots of [
            [yes, badCopy, no],
            [yes, no, badCopy],
        ]) {
            const r = await tally({ poll, ballots: distinctBallotCopies(ballots), utxosAt: oneUtxo, verify });
            expect(r).toMatchObject({ tallies: { yes: 1, no: 1 }, turnout: { voters: 2 } });
        }
    });

    it('distinctBallotCopies collapses byte-identical copies and keeps every copy that differs', () => {
        const same = { ...no, sig: { ...no.sig } };
        expect(distinctBallotCopies([no, same, badCopy, no])).toEqual([no, badCopy]);
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

describe('verifyReveal (SPEC §6.4, §10.3, SECURITY Scenario 13)', () => {
    const REVEAL_SK = 'cd'.repeat(32);
    const poll = mkPoll({ mode: 'secret', reveal_pk: bytesToHex(x25519.getPublicKey(hexToBytes(REVEAL_SK))) });
    const AFTER = Date.parse('2026-12-01T00:00:00Z');
    const BEFORE = Date.parse('2026-11-30T23:59:59Z');
    const mkReveal = (over: Partial<Reveal> = {}): Reveal => ({
        v: 0,
        kind: 'oc-vote/reveal',
        poll_id: pollId(poll),
        reveal_sk: REVEAL_SK,
        revealed_at: '2026-12-02T00:00:00Z',
        sig: { alg: 'bip322', pubkey: CREATOR, value: 'good' },
        ...over,
    });

    it('accepts a creator-signed reveal once the deadline has passed, signed over reveal_id', async () => {
        const r = mkReveal();
        const calls: string[] = [];
        const res = await verifyReveal(
            r,
            poll,
            (a) => {
                calls.push(`${a.address}:${a.message}`);
                return verify(a);
            },
            AFTER
        );
        expect(res).toEqual({ ok: true });
        expect(calls).toEqual([`${CREATOR}:${revealId(r)}`]);
    });

    it("judges the deadline by the verifier's clock, not the creator's revealed_at", async () => {
        // Dated after the deadline, checked before it: still premature.
        expect(await verifyReveal(mkReveal(), poll, verify, BEFORE)).toMatchObject({ ok: false, code: 'E_NO_REVEAL' });
        // Dated before the deadline, checked after it: the date decides nothing.
        expect(await verifyReveal(mkReveal({ revealed_at: '2026-11-30T00:00:00Z' }), poll, verify, AFTER)).toEqual({
            ok: true,
        });
    });

    it("refuses a key that is not the poll's reveal_pk, however well signed", async () => {
        const r = mkReveal({ reveal_sk: 'ef'.repeat(32) });
        expect(await verifyReveal(r, poll, verify, AFTER)).toMatchObject({ ok: false, code: 'E_NO_REVEAL' });
    });

    it.each([
        ['other poll', { poll_id: '00'.repeat(32) }],
        ['bad signature', { sig: { alg: 'bip322' as const, pubkey: CREATOR, value: 'bad' } }],
        ['malformed reveal_sk', { reveal_sk: 'zz' }],
        ['revealed_at with no zone', { revealed_at: '2026-12-02T00:00:00' }],
    ])('rejects: %s', async (_name, over) => {
        expect((await verifyReveal(mkReveal(over as Partial<Reveal>), poll, verify, AFTER)).ok).toBe(false);
    });

    it('rejects a reveal for a public poll', async () => {
        const pub = mkPoll();
        const r = { ...mkReveal(), poll_id: pollId(pub) };
        expect(await verifyReveal(r, pub, verify, AFTER)).toMatchObject({ ok: false, code: 'E_NO_REVEAL' });
    });
});

describe('iso8601_utc times (SPEC §0, §3.3, §4.3)', () => {
    it.each([
        ['2026-05-07T23:30:00Z', Date.UTC(2026, 4, 7, 23, 30)],
        ['2026-05-07T23:30:00.250Z', Date.UTC(2026, 4, 7, 23, 30, 0, 250)],
    ])('reads %s', (s, ms) => {
        expect(parseUtc(s)).toBe(ms);
    });

    it.each([
        ['no zone', '2026-05-07T23:30:00'],
        ['an offset', '2026-05-07T23:30:00+00:00'],
        ['a day that does not exist', '2026-02-30T00:00:00Z'],
        ['hour 24', '2026-05-07T24:00:00Z'],
        ['a date only', '2026-05-07'],
        ['words', 'late-1'],
        ['a number', 1778196600000],
    ])('refuses %s', (_name, s) => {
        expect(parseUtc(s)).toBeNull();
    });

    it('verifyPoll refuses a deadline with no zone', async () => {
        expect(await verifyPoll(mkPoll({ deadline: '2026-12-01T00:00:00' }), verify)).toMatchObject({
            ok: false,
            code: 'E_WRONG_POLL',
        });
    });

    it('verifyBallot refuses a created_at with no zone', async () => {
        const b = mkBallot(mkPoll(), ALICE, { created_at: '2026-06-02T00:00:00' });
        expect(await verifyBallot(b, verify)).toMatchObject({ ok: false, code: 'E_WRONG_POLL' });
    });

    it('tally refuses a poll whose deadline has no zone', async () => {
        const poll = mkPoll({ deadline: '2026-12-01T00:00:00' });
        await expect(tally({ poll, ballots: [], utxosAt: oneUtxo, verify })).rejects.toMatchObject({
            code: 'E_WRONG_POLL',
        });
    });

    it('a ballot whose created_at is not a time is dropped, in every input order', async () => {
        // One voter: yes on 06-01, no on 06-02, and a signed yes dated "late-…".
        // Read leniently, the third compares as NaN and the winner depended on
        // the order relays returned the ballots.
        const poll = mkPoll();
        const x = mkBallot(poll, ALICE, { option: 'yes', created_at: '2026-06-01T00:00:00Z' });
        const y = mkBallot(poll, ALICE, { option: 'no', created_at: '2026-06-02T00:00:00Z' });
        const n = mkBallot(poll, ALICE, { option: 'yes', created_at: 'late-1' });
        const orders = [
            [x, y, n], [x, n, y], [y, x, n], [y, n, x], [n, x, y], [n, y, x],
        ]; // prettier-ignore
        for (const ballots of orders) {
            const r = await tally({ poll, ballots, utxosAt: oneUtxo, verify });
            expect(r).toMatchObject({ tallies: { yes: 0, no: 1 } });
        }
    });

    it('a ballot dated with no zone is dropped whatever the time zone', async () => {
        // Two days before the deadline in every time zone, so only the missing zone drops it.
        const poll = mkPoll();
        const b = mkBallot(poll, ALICE, { created_at: '2026-11-29T00:00:00' });
        expect(await tally({ poll, ballots: [b], utxosAt: oneUtxo, verify })).toMatchObject({
            tallies: { yes: 0, no: 0 },
        });
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
