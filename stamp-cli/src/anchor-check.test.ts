import type { StampEnvelope } from '@orangecheck/stamp-core';
import { hexDecode, makeAnchorVerifier } from '@orangecheck/stamp-ots';
import { describe, expect, it } from 'vitest';

import { advanceOts } from './anchor-check';

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
        const anchored = makeAnchorVerifier({ headerSource: chain });
        expect(await anchored(next.ots!.proof, INC_HEIGHT, INC_HASH, INC_ID)).toBe(true);
    });

    it('keeps the existing pending proof while the calendar has no upgrade', async () => {
        const next = await advanceOts(pending, { headers: chain, fetch: calendar(null) });
        expect(next.ots).toEqual(pending.ots);
    });
});
