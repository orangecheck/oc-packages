/**
 * filterAllowlist refuses an option it does not read. A misspelt `minSats`
 * would otherwise be ignored, the threshold would be 0, and every attested
 * address would make the list.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/sdk', () => ({
    check: vi.fn(async () => ({ ok: true, sats: 1_000_000, days: 365, score: 1 })),
}));
import { check } from '@orangecheck/sdk';

import { filterAllowlist, type FilterAllowlistOptions } from '../index';

beforeEach(() => {
    vi.mocked(check).mockClear();
});

describe('unknown options', () => {
    it('refuses a misspelt threshold instead of reading it as 0', async () => {
        const misspelt = { min_sats: 100_000, minDays: 30 } as unknown as FilterAllowlistOptions;
        await expect(filterAllowlist(['bc1qgood'], misspelt)).rejects.toThrow(TypeError);
        await expect(filterAllowlist(['bc1qgood'], misspelt)).rejects.toThrow(/unknown option min_sats/);
        expect(check).not.toHaveBeenCalled();
    });

    it('every option it reads is accepted', async () => {
        const known: FilterAllowlistOptions = {
            minSats: 100_000,
            minDays: 30,
            concurrency: 2,
            onProgress: () => {},
            relays: ['wss://relay.example'],
            rejectOnError: true,
        };
        await expect(filterAllowlist(['bc1qgood'], known)).resolves.toMatchObject({ ok: ['bc1qgood'] });
    });
});
