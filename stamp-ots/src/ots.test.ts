import { describe, expect, it } from 'vitest';

import { hexDecode, hexEncode } from './base64.js';
import { bitcoinAnchors, parseDetached, parseProof, serializeTimestamp } from './ots.js';
import { BLOCK_HEADER_HEX, BLOCK_HEIGHT, HELLO_DIGEST, HELLO_OTS_FILE } from './ots-fixture.test-helper.js';

describe('OTS proof parsing', () => {
    it('walks a detached proof to the Merkle root in the attested block header', () => {
        const { digest, timestamp } = parseDetached(HELLO_OTS_FILE);
        expect(hexEncode(digest)).toBe(HELLO_DIGEST);
        const [anchor] = bitcoinAnchors(timestamp);
        expect(anchor?.blockHeight).toBe(BLOCK_HEIGHT);
        expect(hexEncode(anchor!.merkleRoot)).toBe(BLOCK_HEADER_HEX.slice(72, 136));
    });

    it('serializes a parsed timestamp back to the same bytes', () => {
        const { timestamp } = parseDetached(HELLO_OTS_FILE);
        const bare = serializeTimestamp(timestamp);
        expect(hexEncode(bare)).toBe(hexEncode(HELLO_OTS_FILE.subarray(HELLO_OTS_FILE.length - bare.length)));
    });

    it('accepts the bare timestamp encoding rooted at the digest', () => {
        const bare = serializeTimestamp(parseDetached(HELLO_OTS_FILE).timestamp);
        expect(bitcoinAnchors(parseProof(bare, hexDecode(HELLO_DIGEST)))[0]?.blockHeight).toBe(BLOCK_HEIGHT);
    });

    it('refuses a detached proof for a different digest', () => {
        expect(() => parseProof(HELLO_OTS_FILE, hexDecode('00'.repeat(32)))).toThrow(/different digest/);
    });

    it('rejects truncated proofs', () => {
        expect(() => parseDetached(HELLO_OTS_FILE.subarray(0, HELLO_OTS_FILE.length - 5))).toThrow();
    });
});
