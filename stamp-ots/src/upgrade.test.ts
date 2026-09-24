import { describe, expect, it } from 'vitest';

import { makeAnchorVerifier } from './anchor.js';
import { base64Encode, hexDecode, hexEncode } from './base64.js';
import { parseDetached, serializeTimestamp, type OtsTimestamp } from './ots.js';
import {
    BLOCK_HASH,
    BLOCK_HEADER_HEX,
    BLOCK_HEIGHT,
    HELLO_DIGEST,
    HELLO_OTS_FILE,
} from './ots-fixture.test-helper.js';
import type { BlockHeaderSource, OtsProof } from './types.js';
import { upgradeProof } from './upgrade.js';

const CAL = 'https://cal.test';
const chain: BlockHeaderSource = {
    async getHeaderAt(h) {
        return h === BLOCK_HEIGHT ? hexDecode(BLOCK_HEADER_HEX) : null;
    },
};

// Split the real proof the way a calendar does: the client holds the path to
// a pending attestation, the calendar later serves the rest from that point.
function split(depth: number): { pending: OtsTimestamp; rest: OtsTimestamp } {
    const full = parseDetached(HELLO_OTS_FILE).timestamp;
    const toBitcoin = (n: OtsTimestamp): boolean =>
        n.attestations.some((a) => a.kind === 'bitcoin') || n.ops.some((o) => toBitcoin(o.child));
    const copy: OtsTimestamp = { msg: full.msg, attestations: [], ops: [] };
    let src = full;
    let dst = copy;
    for (let i = 0; i < depth; i++) {
        const next = src.ops.find((o) => toBitcoin(o.child))!;
        const child: OtsTimestamp = { msg: next.child.msg, attestations: [], ops: [] };
        dst.ops.push({ op: next.op, child });
        src = next.child;
        dst = child;
    }
    dst.attestations.push({ kind: 'pending', uri: CAL });
    return { pending: copy, rest: src };
}

function pendingProof(tree: OtsTimestamp, calendars = [CAL]): OtsProof {
    return {
        status: 'pending',
        proof: base64Encode(serializeTimestamp(tree)),
        calendars,
        blockHeight: null,
        blockHash: null,
        upgradedAt: null,
    };
}

function calendarServing(commitment: Uint8Array, body: Uint8Array, seen: string[]) {
    return (async (url: string) => {
        seen.push(url);
        return url === `${CAL}/timestamp/${hexEncode(commitment)}`
            ? new Response(body)
            : new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
}

describe('upgradeProof', () => {
    it('asks the calendar for its commitment and returns a proof that verifies', async () => {
        const { pending, rest } = split(6);
        const seen: string[] = [];
        const out = await upgradeProof(pendingProof(pending), HELLO_DIGEST, {
            headerSource: chain,
            fetch: calendarServing(rest.msg, serializeTimestamp(rest), seen),
        });
        expect(seen).toEqual([`${CAL}/timestamp/${hexEncode(rest.msg)}`]);
        expect(out.status).toBe('confirmed');
        expect(out.blockHeight).toBe(BLOCK_HEIGHT);
        expect(out.blockHash).toBe(BLOCK_HASH);
        const verify = makeAnchorVerifier({ headerSource: chain });
        expect(await verify(out.proof, out.blockHeight!, out.blockHash!, HELLO_DIGEST)).toBe(true);
    });

    it('stays pending when the calendar answer does not reach the block header', async () => {
        const { pending, rest } = split(6);
        const bogus: OtsTimestamp = { msg: rest.msg, attestations: [{ kind: 'bitcoin', height: BLOCK_HEIGHT }], ops: [] };
        const out = await upgradeProof(pendingProof(pending), HELLO_DIGEST, {
            headerSource: chain,
            fetch: calendarServing(rest.msg, serializeTimestamp(bogus), []),
        });
        expect(out.status).toBe('pending');
    });

    it('does not contact calendars the proof was not submitted to', async () => {
        const { pending, rest } = split(6);
        const seen: string[] = [];
        await expect(
            upgradeProof(pendingProof(pending, ['https://other.test']), HELLO_DIGEST, {
                headerSource: chain,
                fetch: calendarServing(rest.msg, serializeTimestamp(rest), seen),
            })
        ).rejects.toThrow(/no pending attestation/);
        expect(seen).toEqual([]);
    });

    it('returns the proof unchanged while the calendar has nothing new', async () => {
        const { pending } = split(6);
        const current = pendingProof(pending);
        const out = await upgradeProof(current, HELLO_DIGEST, {
            headerSource: chain,
            fetch: (async () => new Response(null, { status: 404 })) as unknown as typeof fetch,
        });
        expect(out).toEqual(current);
    });
});
