import { describe, expect, it } from 'vitest';

import { fromStampOts, toStampOts } from './types.js';

describe('toStampOts / fromStampOts', () => {
    it('round-trips a pending proof', () => {
        const original = {
            status: 'pending' as const,
            proof: 'xxxx',
            calendars: ['https://a.example', 'https://b.example'],
            blockHeight: null,
            blockHash: null,
            upgradedAt: null,
        };
        const stamp = toStampOts(original);
        expect(stamp.status).toBe('pending');
        expect(stamp.block_height).toBeNull();
        const back = fromStampOts(stamp);
        expect(back).toEqual(original);
    });

    it('round-trips a confirmed proof', () => {
        const original = {
            status: 'confirmed' as const,
            proof: 'yyyy',
            calendars: ['https://a.example'],
            blockHeight: 890123,
            blockHash: '0'.repeat(64),
            upgradedAt: '2026-04-24T19:00:00Z',
        };
        const stamp = toStampOts(original);
        expect(stamp.block_height).toBe(890123);
        expect(stamp.block_hash).toBe('0'.repeat(64));
        const back = fromStampOts(stamp);
        expect(back).toEqual(original);
    });
});
