// Anchored polls (SPEC §4.6, §8, §10.3): the inputs the vectors do not pin.

import { x25519 } from '@noble/curves/ed25519';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';

import {
    ANCHOR_GRACE_BLOCKS,
    anchorHeightFromStamps,
    BALLOT_STAMP_MIME,
    ballotStampContent,
} from './anchor.js';
import { canonicalBytes } from './canonical.js';
import { ballotId, pollId } from './ids.js';
import { tally } from './tally.js';
import type { Ballot, Poll, Reveal } from './types.js';
import { verifyReveal } from './verify.js';

const CREATOR = 'bc1qcreator0000000000000000000000000000000';
const ALICE = 'bc1qalice00000000000000000000000000000000';
const CLOSE = 925_000;

function mkPoll(over: Partial<Poll> = {}): Poll {
    return {
        v: 0,
        kind: 'oc-vote/poll',
        creator: CREATOR,
        question: 'anchored?',
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
        created_at: '2026-11-16T00:00:00Z',
        sig: { alg: 'bip322', pubkey: CREATOR, value: 'S' },
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
        created_at: '2026-11-20T00:00:00Z',
        sig: { alg: 'bip322', pubkey: ALICE, value: 'S' },
        ...over,
    };
}

const oneUtxo = async () => [{ value: 100_000, confirmed_height: 800_000 }];

describe('ballotStampContent (SPEC §4.6)', () => {
    it('names the bytes ballot_id hashes, by their UTF-8 length', () => {
        const b = mkBallot(mkPoll());
        const bytes = canonicalBytes({ ...b, sig: { ...b.sig, value: '' } });
        expect(ballotStampContent(b)).toEqual({
            hash: `sha256:${ballotId(b)}`,
            length: new TextEncoder().encode(bytes).length,
            mime: BALLOT_STAMP_MIME,
        });
    });

    it('counts bytes, not characters', () => {
        const poll = mkPoll({ options: [{ id: 'oui', label: 'oui' }, { id: 'nein', label: 'nein' }] });
        const b = mkBallot(poll, { option: 'oui', voter: ALICE, attestation_id: 'é' });
        const bytes = canonicalBytes({ ...b, sig: { ...b.sig, value: '' } });
        expect(ballotStampContent(b).length).toBe(bytes.length + 1);
    });
});

describe('anchorHeightFromStamps (SPEC §4.6)', () => {
    const id = 'ab'.repeat(32);
    const stamp = (hash: string, height: number) => ({ content: { hash }, height });
    const read = (s: { content: { hash: string } }) => (s as unknown as { height: number }).height;

    it('takes the lowest verified height across every copy', async () => {
        const copies = [stamp(`sha256:${id}`, 925_010), stamp(`sha256:${id}`, 925_004), stamp(`sha256:${id}`, 925_007)];
        expect(await anchorHeightFromStamps(id, copies, read)).toBe(925_004);
    });

    it('ignores a stamp whose content.hash names another ballot, however low its anchor', async () => {
        const copies = [stamp(`sha256:${'cd'.repeat(32)}`, 1), stamp(`sha256:${id}`, 925_004)];
        expect(await anchorHeightFromStamps(id, copies, read)).toBe(925_004);
    });

    it('ignores anchors that do not verify or are not heights', async () => {
        const copies = [stamp(`sha256:${id}`, 0), stamp(`sha256:${id}`, 925_004)];
        expect(await anchorHeightFromStamps(id, copies, read)).toBe(925_004);
        expect(await anchorHeightFromStamps(id, [null, 'x', {}], read)).toBeNull();
        expect(await anchorHeightFromStamps(id, [stamp(`sha256:${id}`, 9)], () => null)).toBeNull();
    });

    it('rejects when an anchor cannot be checked, rather than reading it as no anchor', async () => {
        const down = () => {
            throw new Error('headers unreachable');
        };
        await expect(anchorHeightFromStamps(id, [stamp(`sha256:${id}`, 9)], down)).rejects.toThrow(/unreachable/);
    });
});

describe('an anchor that cannot be checked (SPEC §4.6)', () => {
    const poll = mkPoll();
    const ballot = mkBallot(poll);
    const id = ballotId(ballot);
    const good = { content: { hash: `sha256:${id}` }, height: CLOSE - 5 };
    const unread = { content: { hash: `sha256:${id}` }, height: CLOSE - 9, down: true };
    const verifyAnchor = (s: { content: { hash: string } }) => {
        const x = s as unknown as { height: number; down?: boolean };
        if (x.down) throw new Error('headers unreachable');
        return x.height;
    };
    const finalTally = (copies: unknown[]) =>
        tally({
            poll,
            ballots: [ballot],
            utxosAt: oneUtxo,
            skipSignatures: true,
            tipHeight: CLOSE + ANCHOR_GRACE_BLOCKS + 6,
            closeHeight: CLOSE,
            anchorHeight: (bid) => anchorHeightFromStamps(bid, copies, verifyAnchor),
        });

    it('fails the final tally rather than drop the ballot as unanchored', async () => {
        await expect(finalTally([unread])).rejects.toThrow(/unreachable/);
    });

    it('fails it even when another copy verified, since the unread copy may be lower', async () => {
        await expect(finalTally([good, unread])).rejects.toThrow(/unreachable/);
    });

    it('counts the ballot once every copy can be read', async () => {
        await expect(finalTally([good])).resolves.toMatchObject({ state: 'tallied', counted: [id] });
    });
});

describe('tally of an anchored poll (SPEC §4.6, §8)', () => {
    const poll = mkPoll();
    const anchoredBallot = mkBallot(poll);
    const fresh = mkBallot(poll, { voter: 'bc1qbob0000000000000000000000000000000000', created_at: '2026-11-21T00:00:00Z', option: 'no' });
    const base = { poll, ballots: [anchoredBallot, fresh], utxosAt: oneUtxo, skipSignatures: true as const };
    const anchors: Record<string, number> = { [ballotId(anchoredBallot)]: CLOSE - 10 };
    const anchorHeight = (id: string) => anchors[id] ?? null;

    it('requires closeHeight to be stated, null included', async () => {
        await expect(tally({ ...base, tipHeight: CLOSE, anchorHeight })).rejects.toThrow(/closeHeight/);
    });

    it('is provisional while H_close is unknown, and counts what is not anchored yet', async () => {
        const r = await tally({ ...base, tipHeight: CLOSE - 5, closeHeight: null, anchorHeight });
        expect(r).toMatchObject({ state: 'provisional', basis: 'anchored', close_height: null, unanchored: 1 });
        expect(r.state === 'provisional' && r.counted).toEqual([ballotId(anchoredBallot), ballotId(fresh)].sort());
    });

    it('in a provisional tally, an anchor above H_close + G is not in time', async () => {
        const late = { ...anchors, [ballotId(fresh)]: CLOSE + ANCHOR_GRACE_BLOCKS + 1 };
        const r = await tally({
            ...base,
            tipHeight: CLOSE + ANCHOR_GRACE_BLOCKS + 5,
            closeHeight: CLOSE,
            anchorHeight: (id) => late[id] ?? null,
        });
        expect(r).toMatchObject({ state: 'provisional', unanchored: 1, turnout: { voters: 2 } });
    });

    it('takes a "deadline" snapshot from H_close, and defers while it is unknown or unconfirmed', async () => {
        const p = mkPoll({ snapshot_block: 'deadline' });
        const b = mkBallot(p);
        const args = { poll: p, ballots: [b], utxosAt: oneUtxo, skipSignatures: true as const, anchorHeight: () => CLOSE - 1 };
        await expect(tally({ ...args, tipHeight: CLOSE - 1, closeHeight: null })).resolves.toEqual({
            state: 'deferred',
            code: 'E_REORG',
            basis: 'anchored',
            close_height: null,
        });
        await expect(tally({ ...args, tipHeight: CLOSE + 4, closeHeight: CLOSE })).resolves.toMatchObject({
            state: 'deferred',
        });
        await expect(tally({ ...args, tipHeight: CLOSE + 5, closeHeight: CLOSE })).resolves.toMatchObject({
            state: 'provisional',
            snapshot_block: CLOSE,
        });
        await expect(
            tally({ ...args, tipHeight: CLOSE + 50, closeHeight: CLOSE, snapshotBlock: CLOSE - 1 })
        ).rejects.toThrow(/differs from closeHeight/);
    });

    it('a secret anchored poll says awaiting_reveal with its basis until final', async () => {
        const p = mkPoll({ mode: 'secret', reveal_pk: 'ab'.repeat(32) });
        const r = await tally({
            poll: p,
            ballots: [],
            utxosAt: oneUtxo,
            skipSignatures: true,
            tipHeight: CLOSE + 1,
            closeHeight: CLOSE,
            anchorHeight: () => null,
        });
        expect(r).toEqual({ state: 'awaiting_reveal', basis: 'anchored', close_height: CLOSE });
    });
});

describe('verifyReveal for an anchored poll (SPEC §10.3)', () => {
    const SK = 'cd'.repeat(32);
    const poll = mkPoll({ mode: 'secret', reveal_pk: bytesToHex(x25519.getPublicKey(hexToBytes(SK))) });
    const reveal: Reveal = {
        v: 0,
        kind: 'oc-vote/reveal',
        poll_id: pollId(poll),
        reveal_sk: SK,
        revealed_at: '2026-12-02T00:00:00Z',
        sig: { alg: 'bip322', pubkey: CREATOR, value: 'S' },
    };
    const later = Date.parse('2027-01-01T00:00:00Z');
    const finalTip = CLOSE + ANCHOR_GRACE_BLOCKS + 6;

    it('refuses while H_close is unknown, whatever the clock says', async () => {
        const r = await verifyReveal(reveal, poll, () => true, later, { tipHeight: finalTip, closeHeight: null });
        expect(r).toMatchObject({ ok: false, code: 'E_NO_REVEAL' });
    });

    it('accepts once the tip reaches H_close + G + 6, and not a block before', async () => {
        expect(await verifyReveal(reveal, poll, () => true, later, { tipHeight: finalTip, closeHeight: CLOSE })).toEqual({
            ok: true,
        });
        expect(
            await verifyReveal(reveal, poll, () => true, later, { tipHeight: finalTip - 1, closeHeight: CLOSE })
        ).toMatchObject({ ok: false, code: 'E_NO_REVEAL' });
    });
});
