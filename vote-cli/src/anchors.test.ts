// Anchored polls (SPEC §4.6) in the CLI: anchors read from every stamp copy,
// checked against headers this CLI reads, and counted by vote-core.

import { hexToBytes } from '@noble/hashes/utils';
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { stamp } from '@orangecheck/stamp-core';
import { base64Encode } from '@orangecheck/stamp-ots';
import type { BlockHeaderSource } from '@orangecheck/stamp-ots';
import { ballotId, ballotStampContent, pollId, type Ballot, type Poll } from '@orangecheck/vote-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { anchoredChain, stampAnchorVerifier } from './anchors.js';
import { computeTally } from './commands/tally.js';
import type { EventsFetch, NostrEvent } from './nostr.js';

const KEY = new Uint8Array(32).fill(5);
const SIGNER = addressFromPrivateKey(KEY, 'p2wpkh');
const CLOSE = 925_000;
const BITCOIN_TAG = [0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01];

/** An OTS proof with no operations: a Bitcoin attestation over the digest itself. */
function directProof(height: number): Uint8Array {
    const payload: number[] = [];
    let n = height;
    do {
        let b = n & 0x7f;
        n = Math.floor(n / 128);
        if (n > 0) b |= 0x80;
        payload.push(b);
    } while (n > 0);
    return new Uint8Array([0x00, ...BITCOIN_TAG, payload.length, ...payload]);
}

class Headers implements BlockHeaderSource {
    roots = new Map<number, Uint8Array>();
    down = false;
    async getHeaderAt(height: number) {
        if (this.down) throw new Error('header source down');
        const root = this.roots.get(height);
        if (!root) return null;
        const h = new Uint8Array(80);
        h.set(root, 36);
        return h;
    }
}

/** A stamp over `ballot`, anchored at `height` in `headers`. */
async function anchoredStamp(ballot: Ballot, height: number, headers: Headers) {
    const c = ballotStampContent(ballot);
    const env = await stamp({
        content: { hash: c.hash, length: c.length },
        mime: c.mime,
        signer: { address: SIGNER, signMessage: async (m) => signMessage(SIGNER, m, KEY) },
        signedAt: '2026-11-20T00:00:00Z',
    });
    headers.roots.set(height, hexToBytes(env.id));
    return {
        ...env,
        ots: {
            status: 'confirmed' as const,
            proof: base64Encode(directProof(height)),
            calendars: [],
            block_height: 1,
            block_hash: '00'.repeat(32),
            upgraded_at: '2026-11-20T01:00:00Z',
        },
    };
}

const poll: Poll = {
    v: 0,
    kind: 'oc-vote/poll',
    creator: 'bc1qcreator0000000000000000000000000000000',
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
    sig: { alg: 'bip322', pubkey: 'bc1qcreator0000000000000000000000000000000', value: 'S' },
};
const mkBallot = (voter: string, option: string): Ballot => ({
    v: 0,
    kind: 'oc-vote/ballot',
    poll_id: pollId(poll),
    voter,
    option,
    attestation_id: null,
    secret: null,
    created_at: '2026-11-20T00:00:00Z',
    sig: { alg: 'bip322', pubkey: voter, value: 'S' },
});
const early = mkBallot('bc1qalice00000000000000000000000000000000', 'yes');
const late = mkBallot('bc1qbob0000000000000000000000000000000000', 'no');

// median_time_past rises 600 s a block and block CLOSE lands on the deadline.
const DEADLINE = Date.parse(poll.deadline) / 1000;
const blockTimes = (tip: number) => ({
    blockHeightAtTimestamp: async () => CLOSE,
    medianTimePast: async (h: number) => {
        if (h > tip) throw new Error('no such block');
        return DEADLINE + (h - CLOSE) * 600;
    },
    tipHeight: async () => tip,
});
const relay = (stamps: unknown[], complete = true) => async (): Promise<EventsFetch> => ({
    events: stamps.map((s) => ({ content: JSON.stringify(s) }) as unknown as NostrEvent),
    complete,
});

describe('stampAnchorVerifier', () => {
    it('reads the height from the header the proof reaches, never from the stamp', async () => {
        const headers = new Headers();
        const s = await anchoredStamp(early, CLOSE - 3, headers);
        expect(await stampAnchorVerifier(headers)(s)).toBe(CLOSE - 3);
    });

    it('refuses a stamp whose declared id is not the one its fields rebuild', async () => {
        const headers = new Headers();
        const s = await anchoredStamp(early, CLOSE - 3, headers);
        expect(await stampAnchorVerifier(headers)({ ...s, id: 'ef'.repeat(32) })).toBeNull();
        expect(
            await stampAnchorVerifier(headers)({ ...s, content: { ...s.content, hash: `sha256:${'cd'.repeat(32)}` } })
        ).toBeNull();
    });

    it('throws when headers cannot be read', async () => {
        const headers = new Headers();
        const s = await anchoredStamp(early, CLOSE - 3, headers);
        headers.down = true;
        await expect(stampAnchorVerifier(headers)(s)).rejects.toThrow(/down/);
    });
});

describe('anchoredChain and the tally (SPEC §4.6, §8)', () => {
    beforeEach(() => {
        // resolveCloseBlock reads no chain for a deadline still to come by the wall clock.
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-12-02T00:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    async function run(tip: number) {
        const headers = new Headers();
        const s = await anchoredStamp(early, CLOSE - 3, headers);
        const pending = { ...s, ots: { ...s.ots, status: 'pending' as const, proof: '' } };
        const chain = await anchoredChain(poll, [ballotId(early), ballotId(late)], {
            blockTimes: blockTimes(tip),
            headers,
            fetchStamps: relay([pending, s]),
        });
        return computeTally({
            poll,
            ballots: [early, late],
            reveal: null,
            utxosAt: async () => [],
            chain,
            verify: null,
        });
    }

    it('is final at H_close + G + 6 and counts only the anchored ballot', async () => {
        expect(await run(CLOSE + 36 + 6)).toMatchObject({
            state: 'tallied',
            basis: 'anchored',
            close_height: CLOSE,
            counted: [ballotId(early)],
        });
    });

    it('is provisional a block earlier and says one counted ballot is not anchored', async () => {
        expect(await run(CLOSE + 36 + 5)).toMatchObject({ state: 'provisional', unanchored: 1 });
    });

    it('refuses to count when no relay finished answering the stamp query', async () => {
        await expect(
            anchoredChain(poll, [ballotId(early)], {
                blockTimes: blockTimes(CLOSE + 100),
                headers: new Headers(),
                fetchStamps: relay([], false),
            })
        ).rejects.toThrow(/stamp query/);
    });

    it('is null for a clock-dated poll', async () => {
        expect(await anchoredChain({ ...poll, deadline: '2026-11-01T00:00:00Z' }, [])).toBeNull();
    });
});
