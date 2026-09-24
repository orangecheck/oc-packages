import { describe, expect, it } from 'vitest';

import { makeAnchorVerifier, mempoolHeaderSource } from './anchor.js';
import { base64Encode, hexDecode } from './base64.js';
import { parseDetached, serializeTimestamp } from './ots.js';
import {
    BLOCK_HASH,
    BLOCK_HEADER_HEX,
    BLOCK_HEIGHT,
    HELLO_DIGEST,
    HELLO_OTS_FILE,
} from './ots-fixture.test-helper.js';
import type { BlockHeaderSource } from './types.js';

const headers = (map: Record<number, string>): BlockHeaderSource => ({
    async getHeaderAt(h) {
        return map[h] ? hexDecode(map[h]!) : null;
    },
});
const chain = headers({ [BLOCK_HEIGHT]: BLOCK_HEADER_HEX });
const verify = makeAnchorVerifier({ headerSource: chain });
const FILE_B64 = base64Encode(HELLO_OTS_FILE);
const BARE_B64 = base64Encode(serializeTimestamp(parseDetached(HELLO_OTS_FILE).timestamp));

describe('makeAnchorVerifier with the built-in OTS parser', () => {
    it('accepts a real proof against the real block header, in both encodings', async () => {
        expect(await verify(FILE_B64, BLOCK_HEIGHT, BLOCK_HASH, HELLO_DIGEST)).toBe(true);
        expect(await verify(BARE_B64, BLOCK_HEIGHT, BLOCK_HASH, HELLO_DIGEST)).toBe(true);
    });

    it('rejects the proof for any other envelope id', async () => {
        const other = 'ab'.repeat(32);
        expect(await verify(FILE_B64, BLOCK_HEIGHT, BLOCK_HASH, other)).toBe(false);
        expect(await verify(BARE_B64, BLOCK_HEIGHT, BLOCK_HASH, other)).toBe(false);
    });

    it('rejects a declared height the proof does not attest to', async () => {
        expect(await verify(BARE_B64, BLOCK_HEIGHT + 1, BLOCK_HASH, HELLO_DIGEST)).toBe(false);
    });

    it('rejects a declared block hash the header does not hash to', async () => {
        expect(await verify(BARE_B64, BLOCK_HEIGHT, '00'.repeat(32), HELLO_DIGEST)).toBe(false);
    });

    it('rejects when the header at that height carries a different Merkle root', async () => {
        const altered = BLOCK_HEADER_HEX.slice(0, 72) + 'ff' + BLOCK_HEADER_HEX.slice(74);
        const { blockHashOf } = await import('./anchor.js');
        const v = makeAnchorVerifier({ headerSource: headers({ [BLOCK_HEIGHT]: altered }) });
        expect(await v(BARE_B64, BLOCK_HEIGHT, blockHashOf(hexDecode(altered)), HELLO_DIGEST)).toBe(false);
    });

    it('rejects the placeholder proof in the protocol test vectors', async () => {
        const placeholder = 'AE9wZW5UaW1lc3RhbXBzAABDb25maXJtZWQtRml4dHVyZS1ibG9jay04OTAxMjMtbm90LWEtcmVhbC1wcm9vZg==';
        expect(await verify(placeholder, 890123, BLOCK_HASH, HELLO_DIGEST)).toBe(false);
    });
});

describe('mempoolHeaderSource', () => {
    it('resolves height to hash to header', async () => {
        const calls: string[] = [];
        const fetchStub = (async (url: string) => {
            calls.push(url);
            if (url.endsWith(`/block-height/${BLOCK_HEIGHT}`)) return new Response(BLOCK_HASH);
            if (url.endsWith(`/block/${BLOCK_HASH}/header`)) return new Response(BLOCK_HEADER_HEX);
            return new Response('', { status: 404 });
        }) as unknown as typeof fetch;
        const src = mempoolHeaderSource({ baseUrl: 'https://esplora.test/api/', fetch: fetchStub });
        expect(await src.getHeaderAt(BLOCK_HEIGHT)).toEqual(hexDecode(BLOCK_HEADER_HEX));
        expect(await src.getHeaderAt(1)).toBeNull();
        expect(calls[0]).toBe(`https://esplora.test/api/block-height/${BLOCK_HEIGHT}`);
    });
});
