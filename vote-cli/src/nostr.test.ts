// Absence is only evidence once a relay has finished answering (EOSE).

import { describe, expect, it } from 'vitest';

import { reachedEose } from './nostr.js';
import { findPoll, requireComplete } from './select.js';

const st = (ok: boolean, eose: boolean, reason?: string) => ({
    relay: 'wss://r',
    ok,
    eose,
    events: 1,
    rejected: 0,
    ...(reason ? { reason } : {}),
});
const verify = () => true;
const PID = 'ab'.repeat(32);

describe('reachedEose', () => {
    it('is true when a relay sent EOSE', () => {
        expect(reachedEose([st(false, false, 'timeout'), st(true, true)])).toBe(true);
    });

    it('is false when relays are ok only because they timed out or closed after sending events', () => {
        expect(reachedEose([st(true, false, 'timeout'), st(true, false, 'closed')])).toBe(false);
    });

    it('is false with no relays', () => {
        expect(reachedEose([])).toBe(false);
    });
});

describe('findPoll / requireComplete', () => {
    it('says "not found" only when a relay finished answering', async () => {
        await expect(findPoll({ events: [], complete: true }, PID, verify)).rejects.toThrow(
            /poll not found/
        );
    });

    it('says the answer is incomplete, not "not found", when no relay reached EOSE', async () => {
        await expect(findPoll({ events: [], complete: false }, PID, verify)).rejects.toThrow(
            /no relay finished answering/
        );
    });

    it('refuses an incomplete ballot set and passes a complete one through', () => {
        expect(() => requireComplete({ events: [], complete: false }, 'ballot')).toThrow(
            /no relay finished answering the ballot query/
        );
        expect(requireComplete({ events: [], complete: true }, 'ballot')).toEqual([]);
    });
});
