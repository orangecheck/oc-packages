/**
 * filterAllowlist tests.
 *
 * Pins the audit-addressed behaviors:
 *  - concurrency-bounded parallelism (no unbounded fan-out)
 *  - de-dupe with order preservation
 *  - rejectOnError defaults to true (fail-closed for airdrop allocation)
 *  - rejectOnError=false surfaces errors to caller
 *  - progress callback fires once per decided candidate
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/sdk', () => ({ check: vi.fn() }));
import { check } from '@orangecheck/sdk';

import { filterAllowlist } from '../index';

beforeEach(() => {
    vi.mocked(check).mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('filterAllowlist — basic decisions', () => {
    it('partitions passes from fails and preserves input order in `ok`', async () => {
        vi.mocked(check).mockImplementation(async ({ addr }) => {
            // bc1qgood pass, bc1qbad fail.
            const ok = addr === 'bc1qgood';
            return {
                ok,
                sats: ok ? 100_000 : 0,
                days: ok ? 30 : 0,
                score: ok ? 23 : 0,
                reasons: ok ? [] : ['below_min_sats'],
            };
        });

        const result = await filterAllowlist(
            ['bc1qgood', 'bc1qbad', 'bc1qalsogood'],
            { minSats: 100_000 }
        );

        expect(result.ok).toEqual(['bc1qgood']);
        expect(result.rejected).toHaveLength(2);
        expect(result.all).toHaveLength(3);
        expect(result.rejected[0]!.address).toBe('bc1qbad');
        expect(result.rejected[0]!.reasons).toContain('below_min_sats');
    });

    it('also treats bc1qalsogood as passing when both pass', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: true,
            sats: 100_000,
            days: 30,
            score: 23,
        });

        const result = await filterAllowlist(['bc1qalsogood', 'bc1qgood']);
        // Input-order preserved in `ok`.
        expect(result.ok).toEqual(['bc1qalsogood', 'bc1qgood']);
    });
});

describe('de-duplication', () => {
    it('drops exact duplicates before checking', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: true,
            sats: 1,
            days: 1,
            score: 1,
        });

        const result = await filterAllowlist([
            'bc1q1',
            'bc1q1', // exact dup
            '  bc1q2  ', // whitespace-trimmed dup path
            'bc1q2',
            'bc1q3',
        ]);

        // 3 unique addresses, so check() called 3 times.
        expect(vi.mocked(check)).toHaveBeenCalledTimes(3);
        expect(result.ok).toEqual(['bc1q1', 'bc1q2', 'bc1q3']);
    });

    it('drops empty/whitespace-only lines entirely', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: true,
            sats: 1,
            days: 1,
            score: 1,
        });

        const result = await filterAllowlist(['', '   ', 'bc1qonly']);
        expect(result.ok).toEqual(['bc1qonly']);
        expect(vi.mocked(check)).toHaveBeenCalledTimes(1);
    });
});

describe('rejectOnError', () => {
    it('default (true): SDK throws are converted into rejections with lookup_error reason', async () => {
        vi.mocked(check).mockImplementation(async ({ addr }) => {
            if (addr === 'bc1qflaky') throw new Error('upstream timeout');
            return { ok: true, sats: 1, days: 1, score: 1 };
        });

        const result = await filterAllowlist(['bc1qflaky', 'bc1qgood']);

        expect(result.ok).toEqual(['bc1qgood']);
        expect(result.rejected).toHaveLength(1);
        expect(result.rejected[0]!.address).toBe('bc1qflaky');
        expect(result.rejected[0]!.reasons[0]).toBe('lookup_error');
        expect(result.rejected[0]!.reasons[1]).toMatch(/upstream timeout/);
    });

    it('rejectOnError=false surfaces the thrown error to the caller', async () => {
        vi.mocked(check).mockRejectedValue(new Error('boom'));

        await expect(
            filterAllowlist(['bc1qflaky'], { rejectOnError: false })
        ).rejects.toThrow(/boom/);
    });
});

describe('concurrency bound', () => {
    it('never runs more than `concurrency` check() calls in flight at once', async () => {
        let active = 0;
        let peak = 0;
        vi.mocked(check).mockImplementation(async () => {
            active++;
            peak = Math.max(peak, active);
            await new Promise((r) => setTimeout(r, 5));
            active--;
            return { ok: true, sats: 1, days: 1, score: 1 };
        });

        const addresses = Array.from({ length: 20 }, (_, i) => `bc1q${i}`);
        await filterAllowlist(addresses, { concurrency: 3 });

        expect(peak).toBeLessThanOrEqual(3);
        expect(peak).toBeGreaterThan(1); // confirm parallelism actually happens
    });
});

describe('onProgress callback', () => {
    it('fires exactly once per decided candidate with monotonically-increasing done counter', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: true,
            sats: 1,
            days: 1,
            score: 1,
        });

        const progress: Array<{ done: number; total: number }> = [];
        const addresses = ['bc1qa', 'bc1qb', 'bc1qc'];
        await filterAllowlist(addresses, {
            onProgress: (done, total) => {
                progress.push({ done, total });
            },
        });

        expect(progress.map((p) => p.done).sort()).toEqual([1, 2, 3]);
        expect(progress.every((p) => p.total === 3)).toBe(true);
    });
});
