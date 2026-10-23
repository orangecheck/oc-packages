/**
 * The filter refuses an option it does not read. A misspelt `minSats` would
 * otherwise be ignored, the threshold would be 0, and the relay would accept
 * every attested key.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/sdk', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@orangecheck/sdk')>()),
    check: vi.fn(async () => ({ ok: true, sats: 1_000_000, days: 365, score: 1 })),
}));
import { check } from '@orangecheck/sdk';

import { AttestationIndex } from '../attestation-index';
import { __clearFilterCachesForTests, filterEvent } from '../filter';
import type { FilterOptions, MinimalNostrEvent } from '../types';

const event: MinimalNostrEvent = { id: 'b'.repeat(64), pubkey: 'a'.repeat(64), kind: 1 };
const misspelt = { minsats: 100_000, minDays: 30 } as unknown as FilterOptions;

beforeEach(() => {
    vi.mocked(check).mockClear();
    __clearFilterCachesForTests();
});

describe('unknown options', () => {
    it('filterEvent refuses a misspelt threshold instead of reading it as 0', async () => {
        await expect(filterEvent(event, misspelt)).rejects.toThrow(TypeError);
        await expect(filterEvent(event, misspelt)).rejects.toThrow(/unknown option minsats/);
        expect(check).not.toHaveBeenCalled();
    });

    it("the index's decide() refuses one too", () => {
        const index = new AttestationIndex();
        expect(() => index.decide(event, misspelt)).toThrow(/unknown option minsats/);
    });

    it('the index refuses an option it does not read when it is built', () => {
        expect(() => new AttestationIndex({ refresh: 60_000 } as never)).toThrow(/unknown option refresh/);
    });

    it('every option the filter reads is accepted', async () => {
        const known: FilterOptions = {
            minSats: 100_000,
            minDays: 30,
            allowKinds: [0, 3, 10002],
            allowPubkeys: ['c'.repeat(64)],
            cacheTtlMs: 1000,
            cacheMax: 10,
            failOpen: false,
            relays: ['wss://relay.example'],
            onDecision: () => {},
        };
        await expect(filterEvent(event, known)).resolves.toMatchObject({ action: 'accept' });
        expect(() => new AttestationIndex({ relays: [], refreshMs: 60_000, minSats: 1 }).decide(event, known)).not.toThrow();
    });
});
