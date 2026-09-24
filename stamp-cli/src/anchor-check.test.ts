import type { StampEnvelope } from '@orangecheck/stamp-core';
import { hexDecode } from '@orangecheck/stamp-ots';
import { describe, expect, it } from 'vitest';

import { advanceOts, checkAnchorClaim } from './anchor-check';

// opentimestamps-client examples/hello-world.txt.ots as a bare timestamp:
// commits to sha256("Hello World!\n"), anchored in block 358391.
const HELLO_ID = '03ba204e50d126e4674c005e04d82e84c21366780af1f43bd54a37816b6ab340';
const HELLO_PROOF =
    'A/HIAQEAAAAB5IL50y7MO6ZXtp2JgBCFe1RFepBJeYL/Vvl8TsWOb5gBAAAAa0gwRQIhALJTrdHRz5CEQzik' +
    'daBP8T/J570kKwd2LeoH9WCLLeNnAiAAsmjKnDNCs3ac3QYokTF83O+HqsMQtoVenZOJjrvo7AEhAg2OTRB9' +
    'KzObAFDv3UtKCSRaoFYEjxJTljdOpqKrBwnG/////wJlM+YFAAAAABl2qRQL8FfUD7umdEhiUV9bVaIxDeV3' +
    'L4isoIYBAAAAAAAZdqkU8AaIrAAAAAAICPEgqYf3FsUzkTwxTHjjXTWITKyUP6QsrEnSssafQAP4X4gICPEg' +
    '3sVbNIfh4/cipJtVp3gyFYYnhfSjrLOShGAZ9x3GSp0ICPEgssoY9IXggEeOAl2rPUZLQWwOHstmKcmu/OjI' +
    'IU0EJDIICPAgEbDpBmEZb/SwgTw+2hQbq16RYEg3vfegyd832w46EZgICPAgw0vBpKEJP/0UjAFrHmZHQpFO' +
    'k576vk09NWUVkUsm2eIICPAgw+bnw4xp9q8kwr4066xIJX7eYewKIblTXkRDJ3vjBkYICPEgB5i/hgbgACTl' +
    '1dVL8Mlg9infudrWkVdFW28mUsDo3oEICPAgP5rabWC6okQAa7Cq1RRIrS+vudS2SHoJmc/ya5Hw9TYICPEg' +
    'xwMBnpWajdP673SJuzKLpIVXR1jnCR8BRk62WHLJdcgICPAgy/7/9RP/hLkV4/7W+deZZ2Yw+DZOoqbHVX+t' +
    'lKW114gICPEgC+I3CYWZE7q9RGC73fjtIT58h3OksfrOMPis/fCTtwUICAAFiJYNc9cZAQP37xU=';
const HELLO_HEIGHT = 358391;
const HELLO_HASH = '000000000000000003e892881a8cdcdc117c06d444057c98b6f04a9ee75a2319';
const HELLO_HEADER =
    '02000000b96394585a281b7e5f438fd1c9ed492645a1fd61cb3802040000000000000000007ee445d23ad0' +
    '61af4a36b809501fab1ac4f2d7e7a739817dd0cbb7ec661b8a1e376755f58616186272def6';

// opentimestamps-client examples/incomplete.txt.ots, pending at alice, and
// alice's real answer for its commitment, which reaches block 428648.
const INC_ID = '05c4f616a8e5310d19d938cfd769864d7f4ccdc2ca8b479b10af83564b097af9';
const INC_CALENDAR = 'https://alice.btc.calendar.opentimestamps.org';
const INC_COMMITMENT =
    '57cfa5c46716df9bd9e83595bce439c58108d8fcc1678f30d4c6731c3f1fa6c79ed712c66fb1ac8d4e4e' +
    'b0e7';
const INC_PENDING =
    '8BDnVL+TgGp+uqaA73vQEUv0CPAQtXPohQz9nmPR8EP7tvwlDgjxBFfPpcTwCG+xrI1OTrDnAIPf4w0u+QyO' +
    'Li1odHRwczovL2FsaWNlLmJ0Yy5jYWxlbmRhci5vcGVudGltZXN0YW1wcy5vcmc=';
const INC_ANSWER =
    'CPEgZWO7QyqCmsjWxU0akzDSJAZkytgzjdBeY+7BKhimjVAI8CC6g92+K9Z3K0WEtG6u0jYGtxLddAqJ6Z6S' +
    'dXH3f2SqIQjxIBk8gecORHK1KBH+eDfOEpOx01QrJE8n9EGCr4KH/J9OCPEgxsV2lvzTm02ZJHeInQTmiCgp' +
    '9f5VYwSigdziWLeKHwcI8a4BAQAAAAG1ksoDjqqcG2mKBJsJvo7olytdDsopwZlGAnupJIrLAwAAAABIRzBE' +
    'AiAPmS1dvsbtsUP3bBTkU44KUNZrrifGg89CkeR1KH7GrwIgELrpRDOQqtvS4ri591e+6ibT9cNF9+a02Bs9' +
    'OQ7dOBgB/f///wIusUIAAAAAACMhAziySQ6qlJU4Qjc3zYNEmDXRBh3KiPT/rKcYG8rGfSCVrAAAAAAAAAAA' +
    'Imog8ARnigYACAjxIJd6w52Ju4uHnUosOPykigQMgmN5NnB/xFLJ2xOQtRXICAjwIHQmiyPmFJl9GMfAY9jY' +
    'LX4dtXtfxDRsxHrCxG1UFo1xCAjxIFYMRbhU+FB8i/rPJmL+8mnCCKfl31wxRcvOQX7KzFleCAjxIA26hyG5' +
    'zUrHwvzH4Vuiy58pBr/Fd8ISdHzTUtYbXX/bCAjxIIEQegENUn0Yuqh0vJnBmjp6Jd/hEKTImFvzD2w+d7rt' +
    'CAjwIMo83NcJNJiz8YCzipdzIH5S/KmSwtsdZg/fobMpUAw5CAjwIMpsZGTdAs7WTJyCJGzPxibKp42eYkzB' +
    'EBPjtLvAnpiRCAjwIBx64P6sAY+hm9hFmkrpcbPmyBaoclQxfgqfDslCW6dhCAjxIJAmOnPkFal13AdwZ3Lb' +
    'tiAO8NCiMAYhjmXUpdgRIGcwCAjxIHlTAWOw2RIklDhii9eRrJQC+nB+sxTGI3sO+QJxYlyECAgABYiWDXPX' +
    'GQED6JQa';
const INC_HEIGHT = 428648;
const INC_HASH = '000000000000000000ca478eb185560e1f1178746ee05e3d9bc9a31765f6f4a3';
const INC_HEADER =
    '000000208d4d8ed1a5fd3babdbc78d738384042b0ead38c1439b4f000000000000000000da18fe135a3b' +
    'ac24ea548961c6638c29d97f6258166bc9583c2e9fc8e9dd8c071baccf5708fb0418d71bd783';

const headersOf = (map: Record<number, string>) => ({
    getHeaderAt: async (h: number) => (map[h] ? hexDecode(map[h]!) : null),
});

function confirmed(id: string, blockHash = HELLO_HASH): StampEnvelope {
    return {
        id,
        ots: {
            status: 'confirmed',
            proof: HELLO_PROOF,
            calendars: [],
            block_height: HELLO_HEIGHT,
            block_hash: blockHash,
            upgraded_at: '2026-09-24T00:00:00Z',
        },
    } as unknown as StampEnvelope;
}

describe('checkAnchorClaim', () => {
    const chain = headersOf({ [HELLO_HEIGHT]: HELLO_HEADER });

    it('reports anchored when the proof chains to the block header', async () => {
        expect(await checkAnchorClaim(confirmed(HELLO_ID), chain)).toEqual({
            state: 'anchored',
            blockHeight: HELLO_HEIGHT,
        });
    });

    it('fails a proof that does not commit to the envelope id', async () => {
        expect((await checkAnchorClaim(confirmed('ab'.repeat(32)), chain)).state).toBe('fail');
    });

    it('fails a claimed block hash the header does not hash to', async () => {
        expect((await checkAnchorClaim(confirmed(HELLO_ID, '00'.repeat(32)), chain)).state).toBe('fail');
    });

    it('leaves the claim unverified when no header can be fetched', async () => {
        const down = {
            getHeaderAt: async () => {
                throw new Error('offline');
            },
        };
        expect((await checkAnchorClaim(confirmed(HELLO_ID), down)).state).toBe('unverified');
    });
});

describe('advanceOts', () => {
    const pending = {
        id: INC_ID,
        ots: {
            status: 'pending',
            proof: INC_PENDING,
            calendars: [INC_CALENDAR],
            block_height: null,
            block_hash: null,
            upgraded_at: null,
        },
    } as unknown as StampEnvelope;

    function calendar(answer: string | null, seen: string[] = []) {
        return (async (url: string) => {
            seen.push(url);
            if (url === `${INC_CALENDAR}/timestamp/${INC_COMMITMENT}` && answer) {
                return new Response(Uint8Array.from(atob(answer), (c) => c.charCodeAt(0)) as unknown as BodyInit);
            }
            return new Response('Pending confirmation in Bitcoin blockchain', { status: 404 });
        }) as unknown as typeof fetch;
    }
    const chain = headersOf({ [INC_HEIGHT]: INC_HEADER });

    it('upgrades a pending proof from its calendar instead of re-submitting', async () => {
        const seen: string[] = [];
        const next = await advanceOts(pending, { headers: chain, fetch: calendar(INC_ANSWER, seen) });
        expect(seen.some((u) => u.endsWith('/digest'))).toBe(false);
        expect(next.ots).toMatchObject({ status: 'confirmed', block_height: INC_HEIGHT, block_hash: INC_HASH });
        const check = await checkAnchorClaim(next, chain);
        expect(check.state).toBe('anchored');
    });

    it('keeps the existing pending proof while the calendar has no upgrade', async () => {
        const next = await advanceOts(pending, { headers: chain, fetch: calendar(null) });
        expect(next.ots).toEqual(pending.ots);
    });
});
