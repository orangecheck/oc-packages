// The anchor verifier plugged into @orangecheck/stamp-core 1.x verify(), end
// to end: SPEC §8 step 5 through the `verifyOtsAnchor` hook.

import { verify, type StampEnvelope } from '@orangecheck/stamp-core';
import { sha256 } from '@noble/hashes/sha2';
import { describe, expect, it } from 'vitest';

import { blockHashOf, makeAnchorVerifier } from './anchor.js';
import { base64Encode, hexDecode } from './base64.js';
import { serializeTimestamp, type OtsTimestamp } from './ots.js';

// oc-stamp-protocol test-vectors/v01-minimal.json (placeholder signature).
const ENVELOPE = {
    v: 1,
    kind: 'stamp',
    id: 'ad30c983dfc872a8c53cd70eb4d84e1869967a4b8433586beec7ba468b03c3de',
    content: {
        hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
        length: 42,
        mime: 'text/plain',
        ref: null,
    },
    signer: { address: 'bc1qalice000000000000000000000000000000000', alg: 'bip322' },
    signed_at: '2026-04-24T18:30:00Z',
    stake: null,
    ots: null,
    sig: { alg: 'bip322', pubkey: 'bc1qalice000000000000000000000000000000000', value: 'ZmFrZS1zaWduYXR1cmU=' },
} as unknown as StampEnvelope;

const HEIGHT = 900_000;
const idBytes = hexDecode(ENVELOPE.id);
const root = sha256(idBytes);
// id --sha256--> root, attested at HEIGHT.
const proofTree: OtsTimestamp = {
    msg: idBytes,
    attestations: [],
    ops: [{ op: { kind: 'sha256' }, child: { msg: root, attestations: [{ kind: 'bitcoin', height: HEIGHT }], ops: [] } }],
};
const header = new Uint8Array(80);
header.set(root, 36);
const HASH = blockHashOf(header);
const headers = { getHeaderAt: async (h: number) => (h === HEIGHT ? header : null) };

function withOts(blockHash = HASH): StampEnvelope {
    return {
        ...ENVELOPE,
        ots: {
            status: 'confirmed',
            proof: base64Encode(serializeTimestamp(proofTree)),
            calendars: ['https://alice.btc.calendar.opentimestamps.org'],
            block_height: HEIGHT,
            block_hash: blockHash,
            upgraded_at: '2026-09-24T00:00:00Z',
        },
    } as StampEnvelope;
}

describe('stamp-core verify() with makeAnchorVerifier', () => {
    const verifyOtsAnchor = makeAnchorVerifier({ headerSource: headers });

    it('reports a verified confirmed anchor', async () => {
        const r = await verify({ envelope: withOts(), skipSignatureVerification: true, verifyOtsAnchor });
        expect(r.ok && r.anchor).toEqual({ status: 'confirmed', blockHeight: HEIGHT, blockHash: HASH, verified: true });
    });

    it('fails E_BAD_ANCHOR when the claimed block hash is not the header at that height', async () => {
        const r = await verify({
            envelope: withOts('00'.repeat(32)),
            skipSignatureVerification: true,
            verifyOtsAnchor,
        });
        expect(r.ok ? 'ok' : r.code).toBe('E_BAD_ANCHOR');
    });
});
