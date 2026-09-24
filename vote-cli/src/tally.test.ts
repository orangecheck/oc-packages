// Secret-mode tally and poll/reveal selection (SPEC §3.2, §6.4, §8, §10.1).

import { seal } from '@orangecheck/lock-core';
import { generateX25519KeyPair, hexEncode, utf8Encode } from '@orangecheck/lock-crypto';
import { commit, pollId, type Ballot, type Poll, type Reveal } from '@orangecheck/vote-core';
import { describe, expect, it } from 'vitest';

import { computeTally } from './commands/tally.js';
import type { NostrEvent } from './nostr.js';
import { selectPoll, selectReveal } from './select.js';

const CREATOR = 'bc1qcreator0000000000000000000000000000000';
const ALICE = 'bc1qalice00000000000000000000000000000000';

const kp = generateX25519KeyPair();
const revealSk = hexEncode(kp.secret);
const revealPk = hexEncode(kp.public);

const poll: Poll = {
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
    mode: 'secret',
    reveal_pk: revealPk,
    tiebreak: 'latest',
    notes: null,
    created_at: '2026-06-01T00:00:00Z',
    sig: { alg: 'bip322', pubkey: CREATOR, value: 'good' },
};
const pid = pollId(poll);

const reveal: Reveal = {
    v: 0,
    kind: 'oc-vote/reveal',
    poll_id: pid,
    reveal_sk: revealSk,
    revealed_at: '2026-12-02T00:00:00Z',
    sig: { alg: 'bip322', pubkey: CREATOR, value: 'good' },
};

// Test verifier: a signature is valid iff its value is "good".
const verify = ({ signature }: { signature: string }) => signature === 'good';

async function secretBallot(option: string, created_at: string, sig: string): Promise<Ballot> {
    const envelope = await seal({
        payload: utf8Encode(option),
        sender: { address: ALICE, signMessage: async () => '' },
        recipients: [{ address: `oc-vote:reveal:${pid}`, device_id: 'reveal', device_pk: revealPk }],
    });
    return {
        v: 0,
        kind: 'oc-vote/ballot',
        poll_id: pid,
        voter: ALICE,
        option: null,
        attestation_id: null,
        secret: {
            envelope: envelope as unknown as Record<string, unknown>,
            commit: commit(pid, ALICE, option),
        },
        created_at,
        sig: { alg: 'bip322', pubkey: ALICE, value: sig },
    };
}

const ev = (content: unknown, created_at = 1): NostrEvent => ({
    id: String(Math.random()),
    kind: 0,
    pubkey: '',
    created_at,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    tags: [],
    sig: '',
});

describe('computeTally (secret mode)', () => {
    it('counts the voter’s signed ballot when an unsigned one for the same voter is also present', async () => {
        const signed = await secretBallot('yes', '2026-06-02T00:00:00Z', 'good');
        const unsigned = await secretBallot('no', '2026-06-03T00:00:00Z', 'bad');
        const r = await computeTally({
            poll,
            ballots: [signed, unsigned],
            reveal,
            utxosAt: async () => [{ value: 1000, confirmed_height: 800_000 }],
            snapshotBlock: 900000,
            verify,
        });
        expect(r).toMatchObject({ state: 'tallied', tallies: { yes: 1, no: 0 } });
    });

    it('drops a voter whose envelope lock-core rejects, and still tallies the rest', async () => {
        const good = await secretBallot('yes', '2026-06-02T00:00:00Z', 'good');
        const other = await secretBallot('no', '2026-06-02T00:00:00Z', 'good');
        const env = other.secret!.envelope as { sig: Record<string, unknown> };
        // lock-core >= 1.2 throws E_BAD_SIG when sig.pubkey differs from from.address.
        const bad: Ballot = {
            ...other,
            voter: 'bc1qbob0000000000000000000000000000000000',
            secret: {
                envelope: { ...other.secret!.envelope, sig: { ...env.sig, pubkey: 'bc1qsomeoneelse', value: 'AAAA' } },
                commit: commit(pid, 'bc1qbob0000000000000000000000000000000000', 'no'),
            },
        };
        const r = await computeTally({
            poll,
            ballots: [good, bad],
            reveal,
            utxosAt: async () => [{ value: 1000, confirmed_height: 800_000 }],
            snapshotBlock: 900000,
            verify,
        });
        expect(r).toMatchObject({ state: 'tallied', turnout: { voters: 1 }, tallies: { yes: 1, no: 0 } });
    });

    it('stays sealed without a reveal', async () => {
        const signed = await secretBallot('yes', '2026-06-02T00:00:00Z', 'good');
        const r = await computeTally({
            poll,
            ballots: [signed],
            reveal: null,
            utxosAt: async () => [],
            snapshotBlock: 900000,
            verify,
        });
        expect(r).toEqual({ state: 'awaiting_reveal' });
    });
});

describe('selectPoll / selectReveal', () => {
    it('skips newer events that do not match the id or do not verify', async () => {
        const badSig = { ...poll, sig: { ...poll.sig, value: 'bad' } };
        const other = { ...poll, question: 'other' };
        const picked = await selectPoll(
            [ev('not json', 9), ev(other, 8), ev(badSig, 7), ev(poll, 1)],
            pid,
            verify
        );
        expect(picked).toEqual({ poll, signatureValid: true });
    });

    it('reports an id match whose signature does not verify', async () => {
        const badSig = { ...poll, sig: { ...poll.sig, value: 'bad' } };
        expect(await selectPoll([ev(badSig)], pid, verify)).toEqual({
            poll: badSig,
            signatureValid: false,
        });
    });

    it('picks the reveal that verifies, not the newest', async () => {
        const unsignedReveal = { ...reveal, reveal_sk: 'ab'.repeat(32), sig: { ...reveal.sig, value: 'bad' } };
        expect(await selectReveal([ev(unsignedReveal, 9), ev(reveal, 1)], poll, verify)).toEqual(reveal);
    });
});
